import {
  db,
  type LocalSemester,
  type LocalStudent,
  type LocalCourse,
  type LocalEnrollment,
  type LocalAttendanceSession,
  type LocalAttendanceRecord,
  type LocalOutboxEntry,
} from '../db/db';
import { supabase } from './supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Table } from 'dexie';
import { safeStorage } from './safeStorage';

type TableName =
  | 'semesters'
  | 'students'
  | 'courses'
  | 'enrollments'
  | 'attendance_sessions'
  | 'attendance_records';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── localStorage keys ───────────────────────────────────────────────────────

/** Per-table ISO-string cursor: the max(updated_at) seen in the last pull. */
const TABLE_CURSOR_KEY = (t: TableName) => `sync_cursor_${t}`;

/** Persisted sync-status & last-synced timestamp for the UI. */
const LS_STATUS_KEY = 'sync_status';
const LS_LAST_SYNCED_KEY = 'sync_last_synced_at';

// ─── Sync constants ──────────────────────────────────────────────────────────

/** Max outbox attempts before a record is treated as permanently failing. */
const MAX_OUTBOX_ATTEMPTS = 5;

/** Max rows per pull page — avoids Supabase's 1 000-row default cap. */
const PULL_PAGE_SIZE = 500;

/** Network-aware debounce (ms) before a triggered sync fires. */
const DEBOUNCE_MAP: Record<string, number> = {
  '4g': 2000,
  '3g': 5000,
  '2g': 10000,
  'slow-2g': 15000,
};

/** Timeout (ms) applied to every individual Supabase pull/push request. */
const REQUEST_TIMEOUT_MS = 30_000;

/** How long (ms) isSyncing may be true before the watchdog force-resets it. */
const SYNC_WATCHDOG_MS = 60_000;

/** Extra delay (ms) added to triggerSync debounce when another tab is syncing. */
const REMOTE_SYNC_BACKOFF_MS = 6_000;

// ─── Shared server→local field mapping ───────────────────────────────────────
// Single source of truth used by both pullChanges (paginated pull) and
// handleRealtimeEvent (CDC push-down).  Any schema column rename only needs
// to be updated here.

type ServerRow = Record<string, unknown>;
type LocalRow  = Record<string, unknown>;
type MapFnTable = Record<TableName, (r: ServerRow) => LocalRow>;

const SERVER_TO_LOCAL: MapFnTable = {
  semesters: (r) => ({
    serverId: r['id'], name: r['name'],
    startDate: r['start_date'], endDate: r['end_date'],
    isActive: r['is_active'], isArchived: r['is_archived'],
    userId: r['user_id'], isDeleted: r['is_deleted'],
    updatedAt: r['updated_at'], createdAt: r['created_at'],
  }),
  students: (r) => ({
    serverId: r['id'], regNumber: r['reg_number'], name: r['name'],
    email: r['email'], phone: r['phone'],
    userId: r['user_id'], isDeleted: r['is_deleted'],
    updatedAt: r['updated_at'], createdAt: r['created_at'],
  }),
  courses: (r) => ({
    serverId: r['id'], code: r['code'], title: r['title'],
    semesterId: r['semester_id'],
    userId: r['user_id'], isDeleted: r['is_deleted'],
    updatedAt: r['updated_at'], createdAt: r['created_at'],
  }),
  enrollments: (r) => ({
    serverId: r['id'], studentId: r['student_id'], courseId: r['course_id'],
    userId: r['user_id'], isDeleted: r['is_deleted'],
    updatedAt: r['updated_at'], createdAt: r['created_at'],
  }),
  attendance_sessions: (r) => ({
    serverId: r['id'], courseId: r['course_id'],
    date: r['date'], title: r['title'],
    userId: r['user_id'], isDeleted: r['is_deleted'],
    updatedAt: r['updated_at'], createdAt: r['created_at'],
  }),
  attendance_records: (r) => ({
    serverId: r['id'], sessionId: r['session_id'], studentId: r['student_id'],
    status: r['status'],
    // marked_at may be BIGINT (legacy) or TIMESTAMPTZ (after migration) — handle both
    timestamp: typeof r['marked_at'] === 'number'
      ? r['marked_at']
      : new Date(r['marked_at'] as string).getTime(),
    userId: r['user_id'], isDeleted: r['is_deleted'],
    updatedAt: r['updated_at'], createdAt: r['created_at'],
  }),
};

// ─── Helper: request timeout ─────────────────────────────────────────────────

/**
 * Wraps a promise with a hard timeout. If the promise does not settle within
 * `ms` milliseconds, the returned promise rejects with a TimeoutError.
 * This prevents a stalled network request from holding `isSyncing = true`
 * indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => {
        const err = new Error(`Sync request timed out after ${ms}ms`);
        err.name = 'TimeoutError';
        reject(err);
      }, ms),
    ),
  ]);
}




// ─── Main class ───────────────────────────────────────────────────────────────

export class RealtimeSyncEngine {
  private userId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private isSyncing = false;
  private isInitialized = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private rateLimitUntil = 0; // epoch-ms; skip sync attempts until this time
  private remoteSyncActive = false; // true when another tab is currently syncing
  private syncBroadcast: BroadcastChannel | null = null;
  private retryCount = 0;
  private readonly maxRetries = 5; // raised from 3 to reduce false-positive error states
  private readonly HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private currentStatus: SyncStatus = 'idle';
  private statusListeners: ((status: SyncStatus) => void)[] = [];

  constructor() {
    this.setupNetworkListeners();
    db.onLocalChange(() => this.triggerSync());

    // Restore persisted status so the UI shows correct state after a page reload
    const saved = safeStorage.getItem(LS_STATUS_KEY) as SyncStatus | null;
    if (saved) this.currentStatus = saved;

    // ── Multi-tab coordination (8.3) ──────────────────────────────────────
    // When another tab broadcasts that it is syncing, we hold off our own
    // debounced sync to avoid concurrent conflicting writes to the server.
    try {
      this.syncBroadcast = new BroadcastChannel('presensys_sync');
      this.syncBroadcast.onmessage = (ev: MessageEvent<{ type: string }>) => {
        if (ev.data?.type === 'sync_start') {
          this.remoteSyncActive = true;
          // Auto-clear the lock after SYNC_WATCHDOG_MS + a small buffer
          setTimeout(() => { this.remoteSyncActive = false; }, SYNC_WATCHDOG_MS + 5_000);
        } else if (ev.data?.type === 'sync_end') {
          this.remoteSyncActive = false;
        }
      };
    } catch {
      // BroadcastChannel not available (e.g. some private-browsing modes) — ignore.
      this.syncBroadcast = null;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Returns persisted last-synced ISO string (or null if never synced). */
  static getLastSyncedAt(): string | null {
    return safeStorage.getItem(LS_LAST_SYNCED_KEY);
  }

  /** Subscribe to sync-status changes.  Returns an unsubscribe function. */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(callback);
    // Immediately emit the current (possibly persisted) status to the new subscriber
    callback(this.currentStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== callback);
    };
  }

  /** Stop the sync engine and unsubscribe from realtime.  Call on sign-out. */
  cleanup() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.syncBroadcast) {
      try { this.syncBroadcast.close(); } catch { /* ignore */ }
      this.syncBroadcast = null;
    }
    this.userId = null;
    this.isInitialized = false;
    this.isSyncing = false;
    this.retryCount = 0;
    this.remoteSyncActive = false;
    this.rateLimitUntil = 0;
    this.emitStatus('idle');
  }

  /** Debounce a sync trigger (called on every local DB change). */
  triggerSync() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const delay = this.remoteSyncActive
      ? this.getDebounceDelay() + REMOTE_SYNC_BACKOFF_MS
      : this.getDebounceDelay();
    this.debounceTimer = setTimeout(() => {
      this.sync();
    }, delay);
  }

  async initialize(userId: string) {
    if (this.isInitialized && this.userId === userId) return;
    this.userId = userId;
    this.isInitialized = true;

    console.log('Sync: Initialized for user', userId);
    await this.sync();
    this.setupRealtimeSubscription();

    // Periodic heartbeat: trigger a sync every 5 minutes so cross-device
    // changes are picked up even when the user is not interacting with the app.
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.triggerSync(), this.HEARTBEAT_INTERVAL_MS);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private emitStatus(status: SyncStatus) {
    this.currentStatus = status;
    safeStorage.setItem(LS_STATUS_KEY, status);
    if (status === 'synced') {
      safeStorage.setItem(LS_LAST_SYNCED_KEY, new Date().toISOString());
    }
    this.statusListeners.forEach(l => l(status));
  }

  private getDebounceDelay(): number {
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    const effectiveType = conn?.effectiveType ?? '4g';
    return DEBOUNCE_MAP[effectiveType] ?? 2000;
  }

  private isValidUUID(uuid: unknown): boolean {
    return typeof uuid === 'string' && UUID_REGEX.test(uuid);
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.retryCount = 0;
      this.sync();
    });
    window.addEventListener('offline', () => {
      this.emitStatus('offline');
    });
  }

  // ─── Main sync cycle ─────────────────────────────────────────────────────────

  async sync() {
    if (!this.userId || !navigator.onLine || this.isSyncing) return;

    // Respect rate-limit back-off window (8.1)
    if (Date.now() < this.rateLimitUntil) {
      const waitMs = this.rateLimitUntil - Date.now();
      console.log(`Sync: Rate-limited — retrying in ${Math.round(waitMs / 1000)}s`);
      this.retryTimer = setTimeout(() => this.sync(), waitMs);
      return;
    }

    this.isSyncing = true;
    this.emitStatus('syncing');

    // Notify other tabs that we are syncing (8.3)
    try { this.syncBroadcast?.postMessage({ type: 'sync_start' }); } catch { /* ignore */ }

    // Watchdog: if isSyncing stays true for > SYNC_WATCHDOG_MS, force-reset it (2.6)
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      if (this.isSyncing) {
        console.error('Sync: Watchdog triggered — isSyncing stuck. Force-resetting.');
        this.isSyncing = false;
        this.emitStatus('error');
        try { this.syncBroadcast?.postMessage({ type: 'sync_end' }); } catch { /* ignore */ }
      }
    }, SYNC_WATCHDOG_MS);

    try {
      // 1. Pull first so parents exist before children are pushed
      await this.pullChanges();
      // 2. Fix any locally malformed IDs (self-healing safety net)
      await this.selfHealData();
      // 3. Push local changes to server
      await this.pushChanges();
      // 4. Purge synced tombstones and old cached records
      await this.meticulousPurge();

      this.retryCount = 0;
      this.emitStatus('synced');
    } catch (error) {
      console.error('Sync: Failed', error);
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        // ±20 % jitter prevents thundering-herd when many clients recover simultaneously (2.2)
        const jitter = 1 + (Math.random() * 0.4 - 0.2);
        const backoffMs = Math.min(1000 * Math.pow(2, this.retryCount) * jitter, 30_000);
        console.log(`Sync: Retrying in ${Math.round(backoffMs)}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        this.retryTimer = setTimeout(() => this.sync(), backoffMs);
      } else {
        console.error(`Sync: Max retries (${this.maxRetries}) reached.`);
        this.emitStatus('error');
      }
    } finally {
      this.isSyncing = false;
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }
      try { this.syncBroadcast?.postMessage({ type: 'sync_end' }); } catch { /* ignore */ }
    }
  }

  // ─── Pull ────────────────────────────────────────────────────────────────────

  private async pullChanges() {
    if (!this.userId) return;

    // Each table has its own cursor (ISO string from max(updated_at) of last pull).
    // If a table has never been pulled, use epoch-zero to get everything.
    const EPOCH = new Date(0).toISOString();

    const pull = async (
      tableName: TableName,
      dexieTable: Table<LocalRow, number>,
    ): Promise<boolean> => {
      const mapToLocal = SERVER_TO_LOCAL[tableName];
      const cursorKey = TABLE_CURSOR_KEY(tableName);
      const cursor = safeStorage.getItem(cursorKey) ?? EPOCH;
      const isFreshSync = cursor === EPOCH;

      let offset = 0;
      let maxUpdatedAt = '';

      while (true) {
        // Use .gte (>=) instead of .gt (>) to avoid silently skipping rows that
        // share the exact same updated_at timestamp as the page boundary (2.1).
        let query = supabase
          .from(tableName)
          .select('*')
          .eq('user_id', this.userId)
          .gte('updated_at', cursor)
          .order('updated_at', { ascending: true })
          .range(offset, offset + PULL_PAGE_SIZE - 1);

        // On a fresh pull, skip tombstones to avoid importing delete-history
        if (isFreshSync) {
          query = query.eq('is_deleted', 0);
        }

        const { data, error } = await withTimeout(
          query as unknown as Promise<{ data: ServerRow[] | null; error: { code?: string; message?: string } | null }>,
          REQUEST_TIMEOUT_MS,
        );

        if (error) {
          this.handleSupabaseError(error as { code?: string; message?: string });
          console.error(`Sync: Error pulling ${tableName}`, error);
          return false;
        }

        if (!data || data.length === 0) break;

        await db.transaction('rw', dexieTable, async () => {
          for (const serverRow of data) {
            const localItem = await dexieTable.where('serverId').equals(serverRow['id'] as string).first() as (LocalRow & { id?: number; synced?: number; updatedAt?: string }) | undefined;
            const mapped = mapToLocal(serverRow);

            if (localItem) {
              const serverTs: string = (serverRow['updated_at'] as string) ?? '';
              const localTs: string = (localItem.updatedAt as string) ?? '';

              if (localItem.synced === 0) {
                // Pending local write exists.  Apply Last-Write-Wins: compare timestamps.
                if (serverTs <= localTs) {
                  // Local change is newer or same age → keep local, push will overwrite server
                  continue;
                }
                // Server is strictly newer → server wins, accept server state
              } else {
                // Already synced. Skip the write if timestamps are equal to avoid
                // a redundant DB round-trip (dedup for .gte overlap) (2.1).
                if (serverTs === localTs) continue;
              }
              await dexieTable.update(localItem.id!, { ...mapped, synced: 1 });
            } else {
              await dexieTable.add({ ...mapped, synced: 1 });
            }
          }
        });

        // Advance per-table cursor to max(updated_at) from this batch.
        const batchMax = (data as ServerRow[]).reduce((best: string, row: ServerRow) => {
          const ts = (row['updated_at'] as string) ?? '';
          return ts > best ? ts : best;
        }, '');
        if (batchMax > maxUpdatedAt) maxUpdatedAt = batchMax;

        if (data.length < PULL_PAGE_SIZE) break; // last page
        offset += PULL_PAGE_SIZE;
      }

      if (maxUpdatedAt) {
        safeStorage.setItem(cursorKey, maxUpdatedAt);
      } else if (isFreshSync) {
        // Fresh sync with zero records → mark as done so we don't re-request everything.
        safeStorage.setItem(cursorKey, new Date().toISOString());
      }

      return true;
    };

    // Pull all tables independently — a failure in one does NOT block the others,
    // and only that table's cursor stays behind.
    await Promise.allSettled([
      pull('semesters',           db.semesters          as unknown as Table<LocalRow, number>),
      pull('students',            db.students           as unknown as Table<LocalRow, number>),
      pull('courses',             db.courses            as unknown as Table<LocalRow, number>),
      pull('enrollments',         db.enrollments        as unknown as Table<LocalRow, number>),
      pull('attendance_sessions', db.attendanceSessions as unknown as Table<LocalRow, number>),
      pull('attendance_records',  db.attendanceRecords  as unknown as Table<LocalRow, number>),
    ]);
  }

  // ─── Push ────────────────────────────────────────────────────────────────────

  private async pushChanges() {
    if (!this.userId) return;

    // Push semesters
    await this.pushTable<LocalSemester>('semesters', db.semesters, (item) => ({
      id: item.serverId,
      name: item.name,
      start_date: item.startDate,
      end_date: item.endDate,
      is_active: item.isActive,
      is_archived: item.isArchived,
      user_id: this.userId,
      is_deleted: item.isDeleted,
      updated_at: item.updatedAt,
    }));

    // Students have a special dedup path
    await this.pushStudents();

    // Push courses (skip if semesterId is not a valid UUID)
    await this.pushTable<LocalCourse>('courses', db.courses, (item) => {
      if (!this.isValidUUID(item.semesterId)) return null;
      return {
        id: item.serverId,
        code: item.code,
        title: item.title,
        semester_id: item.semesterId,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt,
      };
    });

    // Push enrollments
    await this.pushTable<LocalEnrollment>('enrollments', db.enrollments, (item) => {
      if (!this.isValidUUID(item.studentId) || !this.isValidUUID(item.courseId)) return null;
      return {
        id: item.serverId,
        student_id: item.studentId,
        course_id: item.courseId,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt,
      };
    });

    // Push attendance sessions
    await this.pushTable<LocalAttendanceSession>('attendance_sessions', db.attendanceSessions, (item) => {
      if (!this.isValidUUID(item.courseId)) return null;
      return {
        id: item.serverId,
        course_id: item.courseId,
        date: item.date,
        title: item.title,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt,
      };
    });

    // Push attendance records
    await this.pushTable<LocalAttendanceRecord>('attendance_records', db.attendanceRecords, (item) => {
      if (!this.isValidUUID(item.sessionId) || !this.isValidUUID(item.studentId)) return null;
      return {
        id: item.serverId,
        session_id: item.sessionId,
        student_id: item.studentId,
        status: item.status,
        // Always push as ISO string — works with both BIGINT (legacy) and TIMESTAMPTZ columns
        marked_at: new Date(item.timestamp).toISOString(),
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt,
      };
    });
  }

  /**
   * Generic push for a single table.
   *
   * Key improvements over the original:
   * 1. Tombstones for records that were never pushed to the server are purged
   *    locally instead of creating ghost tombstones on the server.
   * 2. Records that have exceeded MAX_OUTBOX_ATTEMPTS in the outbox are skipped
   *    to prevent an infinite retry loop for permanently broken items.
   * 3. Foreign-key validity is checked via mapFn returning null (unchanged).
   * 4. Orphan synced=0 rows with no outbox entry get a synthetic entry so the
   *    retry counter always has somewhere to increment (2.3).
   */
  private async pushTable<T extends {
    id?: number;
    synced: number;
    isDeleted: number;
    serverId: string;
    updatedAt?: string;
  }>(
    tableName: TableName,
    table: Table<T, number>,
    mapFn: (item: T) => Record<string, unknown> | null,
  ) {
    const unsynced: T[] = await table.filter((i: T) => i.synced === 0).toArray();
    if (unsynced.length === 0) return;

    // ── Outbox: build retry-count map for this table ──────────────────────────
    const outboxAttempts = new Map<string, { entry: LocalOutboxEntry; id: number }>();
    const outboxEntries: LocalOutboxEntry[] = await db.outbox
      .where('tableName').equals(tableName)
      .filter((e: LocalOutboxEntry) => e.done === 0)
      .toArray();
    for (const entry of outboxEntries) {
      outboxAttempts.set(entry.serverId, { entry, id: entry.id! });
    }

    // ── Synthesise outbox entries for orphan records (2.3) ────────────────────
    // If a synced=0 row has no outbox entry (e.g. app crashed between the data
    // write and the outbox write), create one now so the attempt counter can
    // be incremented on failure.
    const now = new Date().toISOString();
    for (const record of unsynced) {
      if (!outboxAttempts.has(record.serverId)) {
        const newId = await db.outbox.add({
          tableName,
          serverId: record.serverId,
          operation: record.isDeleted === 1 ? 'delete' : 'upsert',
          attempts: 0,
          done: 0,
          createdAt: now,
        });
        outboxAttempts.set(record.serverId, {
          entry: { tableName, serverId: record.serverId, operation: 'upsert', attempts: 0, done: 0, createdAt: now },
          id: newId as number,
        });
      }
    }

    // Skip records that have permanently failed
    const eligible = unsynced.filter(r => {
      const ob = outboxAttempts.get(r.serverId);
      return !ob || ob.entry.attempts < MAX_OUTBOX_ATTEMPTS;
    });
    if (eligible.length === 0) return;

    // ── Separate tombstones from live records ─────────────────────────────────
    const tombstones = eligible.filter(r => r.isDeleted === 1);
    const liveRecords = eligible.filter(r => r.isDeleted !== 1);

    // ── Tombstone handling: avoid creating ghost tombstones on the server ─────
    if (tombstones.length > 0) {
      // Batch-check which tombstones actually exist on the server
      const { data: serverRows } = await supabase
        .from(tableName)
        .select('id')
        .in('id', tombstones.map(t => t.serverId));

      const existsOnServer = new Set((serverRows ?? []).map((r: ServerRow) => r['id'] as string));

      // Records that were created and deleted entirely offline → just purge locally
      const toPurgeLocally = tombstones.filter(t => !existsOnServer.has(t.serverId));
      if (toPurgeLocally.length > 0) {
        await table.bulkDelete(toPurgeLocally.map(t => t.id!));
        // Also close their outbox entries
        const purgeServerIds = new Set(toPurgeLocally.map(t => t.serverId));
        for (const [serverId, { id }] of outboxAttempts) {
          if (purgeServerIds.has(serverId)) {
            await db.outbox.update(id, { done: 1 }).catch(() => {});
          }
        }
      }

      // Records that exist on server → push the soft-delete
      const tombstonesToPush = tombstones.filter(t => existsOnServer.has(t.serverId));
      if (tombstonesToPush.length > 0) {
        await this.executeUpsert(tableName, table, tombstonesToPush, mapFn, outboxAttempts);
      }
    }

    // ── Push live records ─────────────────────────────────────────────────────
    if (liveRecords.length > 0) {
      await this.executeUpsert(tableName, table, liveRecords, mapFn, outboxAttempts);
    }
  }

  /** Execute the actual Supabase upsert and handle success / failure bookkeeping. */
  private async executeUpsert<T extends {
    id?: number;
    serverId: string;
    updatedAt?: string;
  }>(
    tableName: TableName,
    table: Table<T, number>,
    records: T[],
    mapFn: (item: T) => Record<string, unknown> | null,
    outboxAttempts: Map<string, { entry: LocalOutboxEntry; id: number }>,
  ) {
    const payload = records.map(mapFn).filter((p): p is Record<string, unknown> => p !== null);
    if (payload.length === 0) {
      const skipped = records.length;
      if (skipped > 0) {
        console.debug(`Sync: Filtered ${skipped} items in ${tableName} with invalid foreign keys (awaiting parent sync).`);
      }
      return;
    }

    const { data, error } = await withTimeout(
      supabase.from(tableName).upsert(payload).select() as unknown as Promise<{
        data: ServerRow[] | null;
        error: { code?: string; message?: string } | null;
      }>,
      REQUEST_TIMEOUT_MS,
    );

    if (error) {
      console.error(`Sync: Error pushing to ${tableName}`, error);
      this.handleSupabaseError(error as { code?: string; message?: string });
      // Increment attempt counter for each failed record
      for (const record of records) {
        const ob = outboxAttempts.get(record.serverId);
        if (ob) {
          await db.outbox.update(ob.id, { attempts: ob.entry.attempts + 1 }).catch(() => {});
        }
      }
    } else if (data) {
      const updates: { key: number; changes: { synced: number; updatedAt: string } }[] = [];
      const doneOutboxIds: number[] = [];

      for (const serverItem of data) {
        const localItem = records.find(u => u.serverId === (serverItem['id'] as string));
        if (!localItem) continue;
        updates.push({
          key: localItem.id!,
          changes: { synced: 1, updatedAt: serverItem['updated_at'] as string },
        });
        const ob = outboxAttempts.get(serverItem['id'] as string);
        if (ob) doneOutboxIds.push(ob.id);
      }

      if (updates.length > 0) await table.bulkUpdate(updates);
      // Mark outbox entries as done
      await Promise.all(doneOutboxIds.map(id => db.outbox.update(id, { done: 1 }).catch(() => {})));
    }
  }

  /**
   * Detect and handle server-side error codes.
   * - 429 (rate limit): sets a back-off window so subsequent calls wait (8.1).
   */
  private handleSupabaseError(error: { code?: string; message?: string }) {
    const isRateLimit =
      error.code === '429' ||
      error.message?.includes('429') ||
      error.message?.toLowerCase().includes('too many requests');

    if (isRateLimit) {
      // Back off for 60 seconds before retrying — longer than the normal retry window.
      const backoffMs = 60_000;
      this.rateLimitUntil = Date.now() + backoffMs;
      console.warn(`Sync: Rate limited by server. Backing off for ${backoffMs / 1000}s.`);
    }
  }

  /**
   * Students need special handling: duplicate reg_number conflicts are resolved
   * by checking for an existing server record and re-homing the local record to
   * use the canonical UUID rather than creating a second student row.
   *
   * Pre-creation deduplication in Students.tsx already prevents most cases;
   * this path is a fallback for multi-device offline races.
   */
  private async pushStudents() {
    const unsynced = await db.students.filter(i => i.synced === 0).toArray();
    if (unsynced.length === 0) return;

    // Outbox retry gate
    const outboxAttempts = new Map<string, { entry: LocalOutboxEntry; id: number }>();
    const outboxEntries: LocalOutboxEntry[] = await db.outbox
      .where('tableName').equals('students')
      .filter((e: LocalOutboxEntry) => e.done === 0)
      .toArray();
    for (const entry of outboxEntries) {
      outboxAttempts.set(entry.serverId, { entry, id: entry.id! });
    }

    // Synthesise outbox entries for orphans (2.3)
    const now = new Date().toISOString();
    for (const record of unsynced) {
      if (!outboxAttempts.has(record.serverId)) {
        const newId = await db.outbox.add({
          tableName: 'students',
          serverId: record.serverId,
          operation: record.isDeleted === 1 ? 'delete' : 'upsert',
          attempts: 0,
          done: 0,
          createdAt: now,
        });
        outboxAttempts.set(record.serverId, {
          entry: { tableName: 'students', serverId: record.serverId, operation: 'upsert', attempts: 0, done: 0, createdAt: now },
          id: newId as number,
        });
      }
    }

    const eligible = unsynced.filter(r => {
      const ob = outboxAttempts.get(r.serverId);
      return !ob || ob.entry.attempts < MAX_OUTBOX_ATTEMPTS;
    });
    if (eligible.length === 0) return;

    // Tombstone handling (same logic as generic pushTable)
    const tombstones = eligible.filter(r => r.isDeleted === 1);
    const liveRecords = eligible.filter(r => r.isDeleted !== 1);

    if (tombstones.length > 0) {
      const { data: serverRows } = await supabase
        .from('students').select('id')
        .in('id', tombstones.map(t => t.serverId));
      const existsOnServer = new Set((serverRows ?? []).map((r: ServerRow) => r['id'] as string));

      const toPurge = tombstones.filter(t => !existsOnServer.has(t.serverId));
      if (toPurge.length > 0) await db.students.bulkDelete(toPurge.map(t => t.id!));

      const toPush = tombstones.filter(t => existsOnServer.has(t.serverId));
      if (toPush.length > 0) {
        const payload = toPush.map(item => ({
          id: item.serverId, reg_number: item.regNumber, name: item.name,
          email: item.email, phone: item.phone, user_id: this.userId,
          is_deleted: item.isDeleted, updated_at: item.updatedAt,
        }));
        await supabase.from('students').upsert(payload, { onConflict: 'id' }).select();
      }
    }

    if (liveRecords.length === 0) return;

    // Deduplicate by reg_number (keep the newest record for each)
    const regMap = new Map<string, LocalStudent>();
    for (const s of liveRecords) {
      const existing = regMap.get(s.regNumber);
      if (!existing || (s.updatedAt && existing.updatedAt && s.updatedAt > existing.updatedAt)) {
        regMap.set(s.regNumber, s);
      }
    }
    const deduped = Array.from(regMap.values());

    const payload = deduped.map(item => ({
      id: item.serverId,
      reg_number: item.regNumber,
      name: item.name,
      email: item.email,
      phone: item.phone,
      user_id: this.userId,
      is_deleted: item.isDeleted,
      updated_at: item.updatedAt,
    }));

    const { data, error } = await withTimeout(
      supabase.from('students').upsert(payload, { onConflict: 'id', ignoreDuplicates: false }).select() as unknown as Promise<{
        data: ServerRow[] | null;
        error: { code?: string; message?: string } | null;
      }>,
      REQUEST_TIMEOUT_MS,
    );

    if (error) {
      if (error.code === '23505') {
        // Batch failed on duplicate reg_number → try one-by-one
        console.warn('Sync: Batch student push hit duplicate constraint, falling back to individual upserts.');
        for (const item of payload) {
          const { data: singleData, error: singleError } = await supabase
            .from('students')
            .upsert(item, { onConflict: 'id' })
            .select();

          if ((singleError as { code?: string } | null)?.code === '23505') {
            // Another device created the same reg_number with a different UUID.
            // Re-home the local record to use the server's canonical UUID.
            const { data: serverRecord } = await supabase
              .from('students').select('id').eq('reg_number', item.reg_number)
              .eq('user_id', this.userId).single();
            if (serverRecord) {
              const localItem = liveRecords.find(u => u.serverId === item.id);
              if (localItem) {
                await db.students.update(localItem.id!, { serverId: (serverRecord as ServerRow)['id'] as string, synced: 1 });
              }
            }
          } else if (!singleError && singleData?.[0]) {
            const localItem = liveRecords.find(u => u.serverId === (singleData[0] as ServerRow)['id'] as string);
            if (localItem) {
              await db.students.update(localItem.id!, { synced: 1, updatedAt: (singleData[0] as ServerRow)['updated_at'] as string });
            }
          }
        }
      } else {
        console.error('Sync: Error pushing to students', error);
        this.handleSupabaseError(error as { code?: string; message?: string });
      }
    } else if (data) {
      const updates: { key: number; changes: { synced: number; updatedAt: string } }[] = [];
      const doneOutboxIds: number[] = [];
      for (const serverItem of data) {
        const localItem = liveRecords.find(u => u.serverId === (serverItem as ServerRow)['id'] as string);
        if (localItem) {
          updates.push({ key: localItem.id!, changes: { synced: 1, updatedAt: (serverItem as ServerRow)['updated_at'] as string } });
          const ob = outboxAttempts.get((serverItem as ServerRow)['id'] as string);
          if (ob) doneOutboxIds.push(ob.id);
        }
      }
      if (updates.length > 0) await db.students.bulkUpdate(updates);
      await Promise.all(doneOutboxIds.map(id => db.outbox.update(id, { done: 1 }).catch(() => {})));
    }
  }

  // ─── Self-heal ────────────────────────────────────────────────────────────────

  /**
   * Fixes local records with numeric / non-UUID foreign keys.
   * This is a safety net for data created before the UUID-first approach was enforced.
   */
  private async selfHealData() {
    let activeSemester = await db.semesters.filter(s => s.isActive).first();
    if (!activeSemester) {
      activeSemester = await db.semesters.orderBy('endDate').reverse().first();
    }

    if (!activeSemester || !this.isValidUUID(activeSemester.serverId)) {
      console.debug('Sync: No valid semester found for self-healing (normal if first sync).');
      return;
    }

    const brokenCourses = (await db.courses.toArray()).filter(c => !this.isValidUUID(c.semesterId));
    if (brokenCourses.length > 0) {
      console.log(`Sync: Self-healing ${brokenCourses.length} courses → semester ${activeSemester.name}`);
      await db.courses.bulkUpdate(brokenCourses.map(c => ({
        key: c.id!,
        changes: { semesterId: activeSemester!.serverId, synced: 0 },
      })));
    }

    const brokenSessions = await db.attendanceSessions
      .filter(s => !this.isValidUUID(s.courseId)).toArray();

    if (brokenSessions.length > 0) {
      const uniqueCourseIds = Array.from(new Set(brokenSessions.map(s => Number(s.courseId))));
      const courses = await db.courses.where('id').anyOf(uniqueCourseIds).toArray();
      const courseMap = new Map(courses.map(c => [c.id, c]));

      const updates = [];
      for (const session of brokenSessions) {
        const course = courseMap.get(Number(session.courseId));
        if (course && this.isValidUUID(course.serverId)) {
          updates.push({
            key: session.id!,
            changes: { courseId: course.serverId, synced: 0 }
          });
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates.map(u => db.attendanceSessions.update(u.key, u.changes)));
      }
    }
  }

  // ─── Purge ────────────────────────────────────────────────────────────────────

  private async meticulousPurge() {
    const tableMapping: Record<TableName, string> = {
      semesters: 'semesters',
      students: 'students',
      courses: 'courses',
      enrollments: 'enrollments',
      attendance_sessions: 'attendanceSessions',
      attendance_records: 'attendanceRecords',
    };

    for (const dexieName of Object.values(tableMapping)) {
      const table = (db as any)[dexieName];
      const toPurge: number[] = await table
        .filter((r: any) => r.isDeleted === 1 && r.synced === 1)
        .primaryKeys();
      if (toPurge.length > 0) await table.bulkDelete(toPurge);
    }

    // Remove attendance records synced over 180 days ago (keeps an entire semester in cache)
    const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const oldRecordKeys: number[] = await db.attendanceRecords
      .filter(r => r.synced === 1 && r.timestamp < sixMonthsAgo)
      .primaryKeys();
    if (oldRecordKeys.length > 0) await db.attendanceRecords.bulkDelete(oldRecordKeys);

    // Remove sessions > 180 days old that have no local attendance records remaining
    const oldSessions = await db.attendanceSessions
      .filter(s => s.synced === 1 && new Date(s.date).getTime() < sixMonthsAgo)
      .toArray();

    if (oldSessions.length > 0) {
      const oldServerIds = oldSessions.map(s => s.serverId);
      const existingSessionIds = await db.attendanceRecords
        .where('sessionId')
        .anyOf(oldServerIds)
        .uniqueKeys();

      const existingSessionIdSet = new Set(existingSessionIds);
      const sessionIdsToDelete = oldSessions
        .filter(s => !existingSessionIdSet.has(s.serverId))
        .map(s => s.id!);

      if (sessionIdsToDelete.length > 0) {
        await db.attendanceSessions.bulkDelete(sessionIdsToDelete);
      }
    }

    // Purge completed outbox entries older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oldOutboxKeys: number[] = await db.outbox
      .filter(e => e.done === 1 && e.createdAt < sevenDaysAgo)
      .primaryKeys();
    if (oldOutboxKeys.length > 0) await db.outbox.bulkDelete(oldOutboxKeys);
  }

  // ─── Realtime ─────────────────────────────────────────────────────────────────

  private setupRealtimeSubscription() {
    if (!this.userId) return;
    if (this.channel) this.channel.unsubscribe();

    // Use a unique channel name per engine instance to avoid duplicate handlers
    // when multiple browser tabs are open with the same account.
    this.channel = supabase
      .channel(`db_changes_${this.userId}_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('attendance_records', db.attendanceRecords as unknown as Table<LocalRow, number>, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('attendance_sessions', db.attendanceSessions as unknown as Table<LocalRow, number>, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('students', db.students as unknown as Table<LocalRow, number>, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('courses', db.courses as unknown as Table<LocalRow, number>, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'semesters', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('semesters', db.semesters as unknown as Table<LocalRow, number>, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('enrollments', db.enrollments as unknown as Table<LocalRow, number>, payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel connected or reconnected → run a catch-up pull to close
          // any gap in coverage while the WebSocket was down.
          console.log('Sync: Realtime channel connected/reconnected, running catch-up pull.');
          this.pullChanges().catch(e => console.error('Sync: Catch-up pull failed', e));

          // Reset heartbeat timer so the next periodic sync fires from now,
          // not from whenever the timer last started before the disconnect (2.4).
          if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
          }
          this.heartbeatTimer = setInterval(() => {
            if (navigator.onLine) this.sync();
          }, this.HEARTBEAT_INTERVAL_MS);
        }
      });
  }

  private async handleRealtimeEvent(
    tableName: string,
    table: Table<LocalRow, number>,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const localItem = await table.where('serverId').equals((newRecord as ServerRow)['id'] as string).first() as (LocalRow & { id?: number; synced?: number; updatedAt?: string }) | undefined;

      if (localItem && localItem.synced === 0) {
        // Pending local write: apply LWW
        const serverTs: string = ((newRecord as ServerRow)['updated_at'] as string) ?? '';
        const localTs: string = (localItem.updatedAt as string) ?? '';
        if (serverTs <= localTs) return; // local is newer, do nothing
      }

      // Use consolidated SERVER_TO_LOCAL map
      const mapFn = SERVER_TO_LOCAL[tableName as TableName];
      if (!mapFn) return;
      const mapped = mapFn(newRecord as ServerRow);

      if (localItem) {
        await table.update(localItem.id!, { ...mapped, synced: 1 });
      } else {
        // Heavy tables: only insert via periodic pull to avoid bloating local storage
        const isHeavy = tableName === 'attendance_records' || tableName === 'attendance_sessions';
        if (!isHeavy) {
          await table.add({ ...mapped, synced: 1 });
        }
      }
    } else if (eventType === 'DELETE') {
      // Physical deletes from Supabase CDC should be treated as soft-deletes locally.
      // The app uses tombstones; hard-deleting would bypass the purge and leave data inconsistencies.
      const localItem = await table.where('serverId').equals((oldRecord as ServerRow)['id'] as string).first() as (LocalRow & { id?: number; synced?: number }) | undefined;
      if (!localItem) return;
      if (localItem.synced === 0) return; // unsynced local change takes precedence

      // Mark as soft-deleted + synced (will be purged by meticulousPurge on next sync)
      await table.update(localItem.id!, { isDeleted: 1, synced: 1 });
    }
  }
}

export const realtimeSync = new RealtimeSyncEngine();
