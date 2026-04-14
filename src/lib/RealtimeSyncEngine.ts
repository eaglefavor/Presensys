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
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName =
  | 'semesters'
  | 'students'
  | 'courses'
  | 'enrollments'
  | 'attendance_sessions'
  | 'attendance_records';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── localStorage keys ───────────────────────────────────────────────────────

/** Per-table ISO-string cursor: the max(updated_at) seen in the last pull. */
const TABLE_CURSOR_KEY = (t: TableName) => `sync_cursor_${t}`;

/** Persisted sync-status & last-synced timestamp for the UI. */
const LS_STATUS_KEY = 'sync_status';
const LS_LAST_SYNCED_KEY = 'sync_last_synced_at';

// ─── Sync constants ──────────────────────────────────────────────────────────

/** Max outbox attempts before a record is treated as permanently failing. */
const MAX_OUTBOX_ATTEMPTS = 5;

/** Network-aware debounce (ms) before a triggered sync fires. */
const DEBOUNCE_MAP: Record<string, number> = {
  '4g': 2000,
  '3g': 5000,
  '2g': 10000,
  'slow-2g': 15000,
};




// ─── Main class ───────────────────────────────────────────────────────────────

export class RealtimeSyncEngine {
  private userId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private isSyncing = false;
  private isInitialized = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private retryCount = 0;
  private readonly maxRetries = 3;
  private readonly HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private currentStatus: SyncStatus = 'idle';
  private statusListeners: ((status: SyncStatus) => void)[] = [];

  constructor() {
    this.setupNetworkListeners();
    db.onLocalChange(() => this.triggerSync());

    // Restore persisted status so the UI shows correct state after a page reload
    const saved = localStorage.getItem(LS_STATUS_KEY) as SyncStatus | null;
    if (saved) this.currentStatus = saved;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Returns persisted last-synced ISO string (or null if never synced). */
  static getLastSyncedAt(): string | null {
    return localStorage.getItem(LS_LAST_SYNCED_KEY);
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
    this.userId = null;
    this.isInitialized = false;
    this.isSyncing = false;
    this.retryCount = 0;
    this.emitStatus('idle');
  }

  /** Debounce a sync trigger (called on every local DB change). */
  triggerSync() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.sync();
    }, this.getDebounceDelay());
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
    localStorage.setItem(LS_STATUS_KEY, status);
    if (status === 'synced') {
      localStorage.setItem(LS_LAST_SYNCED_KEY, new Date().toISOString());
    }
    this.statusListeners.forEach(l => l(status));
  }

  private getDebounceDelay(): number {
    const conn = (navigator as any).connection;
    const effectiveType = conn?.effectiveType || '4g';
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
    this.isSyncing = true;
    this.emitStatus('syncing');

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
        const backoffMs = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        console.log(`Sync: Retrying in ${backoffMs}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        this.retryTimer = setTimeout(() => this.sync(), backoffMs);
      } else {
        console.error(`Sync: Max retries (${this.maxRetries}) reached.`);
        this.emitStatus('error');
      }
    } finally {
      this.isSyncing = false;
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
      dexieTable: any,
      mapToLocal: (serverRow: any) => Record<string, unknown>,
    ): Promise<boolean> => {
      const cursorKey = TABLE_CURSOR_KEY(tableName);
      const cursor = localStorage.getItem(cursorKey) ?? EPOCH;
      const isFreshSync = cursor === EPOCH;

      let query = supabase
        .from(tableName)
        .select('*')
        .eq('user_id', this.userId)
        .gt('updated_at', cursor);

      // On a fresh pull, skip tombstones to avoid importing delete-history
      if (isFreshSync) {
        query = query.eq('is_deleted', 0);
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Sync: Error pulling ${tableName}`, error);
        return false;
      }

      if (data && data.length > 0) {
        await db.transaction('rw', dexieTable, async () => {
          for (const serverRow of data) {
            const localItem = await dexieTable.where('serverId').equals(serverRow.id).first();
            const mapped = mapToLocal(serverRow);

            if (localItem) {
              if (localItem.synced === 0) {
                // Pending local write exists.  Apply Last-Write-Wins: compare timestamps.
                const serverTs: string = serverRow.updated_at ?? '';
                const localTs: string = localItem.updatedAt ?? '';
                if (serverTs <= localTs) {
                  // Local change is newer or same age → keep local, push will overwrite server
                  continue;
                }
                // Server is strictly newer → server wins, accept server state
              }
              await dexieTable.update(localItem.id, { ...mapped, synced: 1 });
            } else {
              await dexieTable.add({ ...mapped, synced: 1 });
            }
          }
        });

        // Advance per-table cursor to max(updated_at) from the received batch.
        // Using server-supplied timestamps eliminates client-clock skew entirely.
        const maxUpdatedAt = (data as any[]).reduce((best: string, row: any) => {
          const ts: string = row.updated_at ?? '';
          return ts > best ? ts : best;
        }, '');
        if (maxUpdatedAt) {
          localStorage.setItem(cursorKey, maxUpdatedAt);
        }
      } else if (!isFreshSync) {
        // No new records — the cursor is still valid; nothing to advance.
        // (Avoid bumping to "now" here; use only server-supplied timestamps.)
      } else {
        // Fresh sync, zero records → mark as synced from epoch so we don't
        // re-request everything on every subsequent sync.
        localStorage.setItem(cursorKey, new Date().toISOString());
      }

      return true;
    };

    // Pull all tables independently — a failure in one does NOT block the others,
    // and only that table's cursor stays behind.
    await Promise.allSettled([
      pull('semesters', db.semesters, (s) => ({
        serverId: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date,
        isActive: s.is_active, isArchived: s.is_archived,
        userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at,
      })),
      pull('students', db.students, (s) => ({
        serverId: s.id, regNumber: s.reg_number, name: s.name,
        email: s.email, phone: s.phone,
        userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at,
      })),
      pull('courses', db.courses, (c) => ({
        serverId: c.id, code: c.code, title: c.title, semesterId: c.semester_id,
        userId: c.user_id, isDeleted: c.is_deleted, updatedAt: c.updated_at,
      })),
      pull('enrollments', db.enrollments, (e) => ({
        serverId: e.id, studentId: e.student_id, courseId: e.course_id,
        userId: e.user_id, isDeleted: e.is_deleted, updatedAt: e.updated_at,
      })),
      pull('attendance_sessions', db.attendanceSessions, (s) => ({
        serverId: s.id, courseId: s.course_id, date: s.date, title: s.title,
        userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at,
      })),
      pull('attendance_records', db.attendanceRecords, (r) => ({
        serverId: r.id, sessionId: r.session_id, studentId: r.student_id,
        status: r.status, timestamp: r.marked_at,
        userId: r.user_id, isDeleted: r.is_deleted, updatedAt: r.updated_at,
      })),
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
        marked_at: item.timestamp,
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
   */
  private async pushTable<T extends {
    id?: number;
    synced: number;
    isDeleted: number;
    serverId: string;
    updatedAt?: string;
  }>(
    tableName: TableName,
    table: any,
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

      const existsOnServer = new Set((serverRows ?? []).map((r: any) => r.id));

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
    table: any,
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

    const { data, error } = await supabase.from(tableName).upsert(payload).select();

    if (error) {
      console.error(`Sync: Error pushing to ${tableName}`, error);
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

      for (const serverItem of data as any[]) {
        const localItem = records.find(u => u.serverId === serverItem.id);
        if (!localItem) continue;
        updates.push({
          key: localItem.id!,
          changes: { synced: 1, updatedAt: serverItem.updated_at },
        });
        const ob = outboxAttempts.get(serverItem.id);
        if (ob) doneOutboxIds.push(ob.id);
      }

      if (updates.length > 0) await table.bulkUpdate(updates);
      // Mark outbox entries as done
      await Promise.all(doneOutboxIds.map(id => db.outbox.update(id, { done: 1 }).catch(() => {})));
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
      const existsOnServer = new Set((serverRows ?? []).map((r: any) => r.id));

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

    const { data, error } = await supabase
      .from('students')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: false })
      .select();

    if (error) {
      if (error.code === '23505') {
        // Batch failed on duplicate reg_number → try one-by-one
        console.warn('Sync: Batch student push hit duplicate constraint, falling back to individual upserts.');
        for (const item of payload) {
          const { data: singleData, error: singleError } = await supabase
            .from('students')
            .upsert(item, { onConflict: 'id' })
            .select();

          if (singleError?.code === '23505') {
            // Another device created the same reg_number with a different UUID.
            // Re-home the local record to use the server's canonical UUID.
            const { data: serverRecord } = await supabase
              .from('students').select('id').eq('reg_number', item.reg_number)
              .eq('user_id', this.userId).single();
            if (serverRecord) {
              const localItem = liveRecords.find(u => u.serverId === item.id);
              if (localItem) {
                await db.students.update(localItem.id!, { serverId: serverRecord.id, synced: 1 });
              }
            }
          } else if (!singleError && singleData?.[0]) {
            const localItem = liveRecords.find(u => u.serverId === singleData[0].id);
            if (localItem) {
              await db.students.update(localItem.id!, { synced: 1, updatedAt: singleData[0].updated_at });
            }
          }
        }
      } else {
        console.error('Sync: Error pushing to students', error);
      }
    } else if (data) {
      const updates: { key: number; changes: { synced: number; updatedAt: string } }[] = [];
      const doneOutboxIds: number[] = [];
      for (const serverItem of data as any[]) {
        const localItem = liveRecords.find(u => u.serverId === serverItem.id);
        if (localItem) {
          updates.push({ key: localItem.id!, changes: { synced: 1, updatedAt: serverItem.updated_at } });
          const ob = outboxAttempts.get(serverItem.id);
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
    for (const session of brokenSessions) {
      const course = await db.courses.get(Number(session.courseId));
      if (course && this.isValidUUID(course.serverId)) {
        await db.attendanceSessions.update(session.id!, { courseId: course.serverId, synced: 0 });
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

    // Remove attendance records synced over 30 days ago (local storage management)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const oldRecordKeys: number[] = await db.attendanceRecords
      .filter(r => r.synced === 1 && r.timestamp < thirtyDaysAgo)
      .primaryKeys();
    if (oldRecordKeys.length > 0) await db.attendanceRecords.bulkDelete(oldRecordKeys);

    // Remove sessions > 30 days old that have no local attendance records remaining
    const oldSessions = await db.attendanceSessions
      .filter(s => s.synced === 1 && new Date(s.date).getTime() < thirtyDaysAgo)
      .toArray();
    for (const session of oldSessions) {
      const localCount = await db.attendanceRecords.where('sessionId').equals(session.serverId).count();
      if (localCount === 0) await db.attendanceSessions.delete(session.id!);
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

    this.channel = supabase
      .channel('db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('attendance_records', db.attendanceRecords, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('attendance_sessions', db.attendanceSessions, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('students', db.students, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('courses', db.courses, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'semesters', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('semesters', db.semesters, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('enrollments', db.enrollments, payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel connected or reconnected → run a catch-up pull to close
          // any gap in coverage while the WebSocket was down.
          console.log('Sync: Realtime channel connected/reconnected, running catch-up pull.');
          this.pullChanges().catch(e => console.error('Sync: Catch-up pull failed', e));
        }
      });
  }

  private async handleRealtimeEvent(tableName: string, table: any, payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const localItem = await table.where('serverId').equals(newRecord.id).first();

      if (localItem && localItem.synced === 0) {
        // Pending local write: apply LWW
        const serverTs: string = newRecord.updated_at ?? '';
        const localTs: string = localItem.updatedAt ?? '';
        if (serverTs <= localTs) return; // local is newer, do nothing
      }

      const mapped = this.mapServerToLocal(tableName, newRecord);

      if (localItem) {
        await table.update(localItem.id, { ...mapped, synced: 1 });
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
      const localItem = await table.where('serverId').equals(oldRecord.id).first();
      if (!localItem) return;
      if (localItem.synced === 0) return; // unsynced local change takes precedence

      // Mark as soft-deleted + synced (will be purged by meticulousPurge on next sync)
      await table.update(localItem.id, { isDeleted: 1, synced: 1 });
    }
  }

  private mapServerToLocal(tableName: string, r: any): Record<string, unknown> {
    const base = {
      serverId: r.id,
      userId: r.user_id,
      isDeleted: r.is_deleted,
      updatedAt: r.updated_at,
    };
    switch (tableName) {
      case 'semesters':
        return { ...base, name: r.name, startDate: r.start_date, endDate: r.end_date, isActive: r.is_active, isArchived: r.is_archived };
      case 'students':
        return { ...base, regNumber: r.reg_number, name: r.name, email: r.email, phone: r.phone };
      case 'courses':
        return { ...base, code: r.code, title: r.title, semesterId: r.semester_id };
      case 'enrollments':
        return { ...base, studentId: r.student_id, courseId: r.course_id };
      case 'attendance_sessions':
        return { ...base, courseId: r.course_id, date: r.date, title: r.title };
      case 'attendance_records':
        return { ...base, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at };
      default:
        return base;
    }
  }
}

export const realtimeSync = new RealtimeSyncEngine();
