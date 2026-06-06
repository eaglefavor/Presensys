/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  db,
  type LocalSemester,
  type LocalStudent,
  type LocalCourse,
  type LocalEnrollment,
  type LocalAttendanceSession,
  type LocalAttendanceRecord,
  type LocalLecturer,
  type LocalCourseSchedule,
  type LocalStudentCredential,
  type LocalOutboxEntry,
} from '../db/db';
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Table } from 'dexie';

type TableName =
  | 'student_credentials'
  | 'semesters'
  | 'students'
  | 'courses'
  | 'enrollments'
  | 'attendance_sessions'
  | 'attendance_records'
  | 'lecturers'
  | 'course_schedules';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NavigatorConnection = {
  effectiveType?: string;
  addEventListener?: (event: string, listener: () => void) => void;
  removeEventListener?: (event: string, listener: () => void) => void;
};

type ServerRow = { id: string; updated_at?: string | null; [key: string]: unknown };

type LocalSyncRecord = {
  id?: number;
  serverId: string;
  synced: number;
  updatedAt?: string;
  isDeleted?: number;
  [key: string]: unknown;
};

type BundleItem = {
  tableName: TableName;
  payload: Record<string, unknown>[];
  records: LocalSyncRecord[];
  table: Table<LocalSyncRecord, number>;
  outboxAttempts: Map<string, { entry: LocalOutboxEntry; id: number }>;
};

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

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
// const PULL_PAGE_SIZE = 500;

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
  private globalBundle: BundleItem[] = [];
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

    if (import.meta.env.DEV) {
      console.log('Sync: Initialized for user', userId);
    }
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

  private getNetworkType(): string {
    const conn = (navigator as Navigator & { connection?: NavigatorConnection }).connection;
    return conn?.effectiveType || '4g';
  }

  private isSlowNetwork(): boolean {
    const type = this.getNetworkType();
    return type === '2g' || type === 'slow-2g';
  }

  private getDebounceDelay(): number {
    return DEBOUNCE_MAP[this.getNetworkType()] ?? 2000;
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

    const EPOCH = new Date(0).toISOString();
    // PULL_PAGE_SIZE is no longer needed since we use Edge Function

    const cursors: Record<string, string> = {};
    const tableNames: TableName[] = [
      'semesters', 'students', 'courses', 'enrollments', 'attendance_sessions',
      'lecturers', 'attendance_records', 'course_schedules', 'student_credentials'
    ];

    for (const t of tableNames) {
      cursors[t] = localStorage.getItem(TABLE_CURSOR_KEY(t)) ?? EPOCH;
    }

    try {
      // GEAR SHIFT: On slow 2G networks, skip full pull unless explicitly requested to save radio power and bandwidth.
      // Realtime events will still handle immediate targeted updates.
      if (this.isSlowNetwork()) {
        console.debug('Sync: Slow network detected. Bypassing full pull batch.');
        return;
      }

      let edgeResponse;
      try {
        const result = await supabase.functions.invoke('sync-pull-bundle', {
          body: { cursors, userId: this.userId }
        });
        if (result.error) throw result.error;
        edgeResponse = result.data;
      } catch (invokeError) {
        // Fallback: If edge function fetch fails (e.g., due to local dev setup or network hiccup),
        // we log it and bypass the full pull batch gracefully instead of crashing the sync.
        console.warn('Sync: Edge function sync-pull-bundle failed, bypassing full pull batch.', invokeError);
        return;
      }

      if (!edgeResponse || !edgeResponse.results) return;

      const processTable = async <T extends LocalSyncRecord>(
        tableName: TableName,
        dexieTable: Table<any  , number>,
        mapToLocal: (serverRow: ServerRow) => T
      ) => {
        const tableData = edgeResponse.results[tableName] as ServerRow[] | undefined;
        if (!tableData || tableData.length === 0) return;

        let maxUpdatedAt = '';
        const serverIds = tableData.map(row => row.id);
        const localItems = await dexieTable.where('serverId').anyOf(serverIds).toArray();
        const localMap = new Map(localItems.map(item => [item.serverId, item]));
        const updates: Array<{ key: number; changes: Partial<T> & { synced: number } }> = [];
        const insertsMap = new Map<string, T>(); // Use Map to deduplicate inserts by serverId

        for (const serverRow of tableData) {
          if (serverRow.updated_at && serverRow.updated_at > maxUpdatedAt) {
            maxUpdatedAt = serverRow.updated_at;
          }

          const localItem = localMap.get(serverRow.id);
          const mapped = mapToLocal(serverRow);
          const serverTs = serverRow.updated_at ?? '';

          if (localItem) {
            if (localItem.synced === 0) {
              const localTs = localItem.updatedAt ?? '';
              if (serverTs && serverTs <= localTs) {
                continue;
              }
            }
            if (localItem.id !== undefined) {
              updates.push({ key: localItem.id, changes: { ...mapped, synced: 1 } });
            }
          } else {
            // Assign a local id and ensure serverId exists to prevent ConstraintError
            const recordToInsert = { ...mapped, synced: 1 } as T;
            if (!recordToInsert.serverId) {
              recordToInsert.serverId = crypto.randomUUID();
            }
            insertsMap.set(recordToInsert.serverId as string, recordToInsert);
          }
        }

        const inserts = Array.from(insertsMap.values());

        await db.transaction('rw', dexieTable, async () => {
          if (updates.length > 0) {
            try {
              await (dexieTable as any).bulkUpdate(updates);
            } catch (err: unknown) {
              if (err instanceof Error && (err.name === 'BulkError' || err.name === 'ConstraintError')) {
                console.warn(`Sync: Ignoring error during update in ${tableName} (likely duplicates/conflicts): `, (err as Error).message);
              } else {
                throw err;
              }
            }
          }

          if (inserts.length > 0) {
            try {
              await dexieTable.bulkAdd(inserts);
            } catch (err: unknown) {
              if (err instanceof Error && (err.name === 'BulkError' || err.name === 'ConstraintError')) {
                console.warn(`Sync: Ignoring error during insert in ${tableName} (likely duplicates): `, (err as Error).message);
              } else {
                throw err;
              }
            }
          }
        });

        if (maxUpdatedAt) {
          localStorage.setItem(TABLE_CURSOR_KEY(tableName), maxUpdatedAt);
        }
      };

      await Promise.all([
        processTable('semesters', db.semesters, (s) => ({
          serverId: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date,
          isActive: s.is_active, isArchived: s.is_archived,
          userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at, createdAt: s.created_at,
        }) as any),
        processTable('students', db.students, (st) => ({
          serverId: st.id, regNumber: st.reg_number, name: st.name, email: st.email, phone: st.phone,
          userId: st.user_id, isDeleted: st.is_deleted, updatedAt: st.updated_at, createdAt: st.created_at,
        }) as any),
        processTable('courses', db.courses, (c) => ({
          serverId: c.id, code: c.code, title: c.title, semesterId: c.semester_id,
          dayOfWeek: c.day_of_week ?? c.day, time: c.time, lecturers: c.lecturers,
          userId: c.user_id, isDeleted: c.is_deleted, updatedAt: c.updated_at, createdAt: c.created_at,
        }) as any),
        processTable('enrollments', db.enrollments, (e) => ({
          serverId: e.id, studentId: e.student_id, courseId: e.course_id,
          userId: e.user_id, isDeleted: e.is_deleted, updatedAt: e.updated_at, createdAt: e.created_at,
        }) as any),
        processTable('attendance_sessions', db.attendanceSessions, (s) => ({
          serverId: s.id, courseId: s.course_id, date: s.date, title: s.title, lecturerId: s.lecturer_id,
          userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at, createdAt: s.created_at,
        }) as any),
        processTable('lecturers', db.lecturers, (l) => ({
          serverId: l.id, name: l.name,
          userId: l.user_id, isDeleted: l.is_deleted, updatedAt: l.updated_at, createdAt: l.created_at,
        }) as any),
        processTable('attendance_records', db.attendanceRecords, (r) => ({
          serverId: r.id, sessionId: r.session_id, studentId: r.student_id,
          status: r.status,
          timestamp: typeof r.marked_at === 'number' ? r.marked_at : new Date(r.marked_at as string).getTime(),
          userId: r.user_id, isDeleted: r.is_deleted, updatedAt: r.updated_at, createdAt: r.created_at,
        }) as any),
        processTable('course_schedules', db.courseSchedules, (cs) => ({
          serverId: cs.id, courseId: cs.course_id, dayOfWeek: cs.day_of_week,
          startTime: cs.start_time, endTime: cs.end_time,
          userId: cs.user_id, isDeleted: cs.is_deleted, updatedAt: cs.updated_at, createdAt: cs.created_at,
        }) as any),
        processTable('student_credentials', db.studentCredentials, (sc) => ({
          serverId: sc.id, studentId: sc.student_id, credentialId: sc.credential_id,
          publicKey: sc.public_key, counter: sc.counter,
          userId: sc.user_id, isDeleted: sc.is_deleted, updatedAt: sc.updated_at, createdAt: sc.created_at,
        }) as any),
      ]);
    } catch (err) {
      console.error('Failed to pull sync bundle', err);
      throw err;
    }
  }

  private async pushChanges() {
    if (!this.userId) return;

    const isSlow = this.isSlowNetwork();

    if (!isSlow) {
      // GEAR SHIFT: On fast networks, push everything starting with metadata
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

      await this.pushStudents();

      await this.pushTable<LocalCourse>('courses', db.courses, (item) => {
        if (!this.isValidUUID(item.semesterId)) return null;
        return {
          id: item.serverId,
          code: item.code,
          title: item.title,
          semester_id: item.semesterId,
          day: item.dayOfWeek ?? null,
          time: item.time ?? null,
          lecturers: item.lecturers ?? null,
          user_id: this.userId,
          is_deleted: item.isDeleted,
          updated_at: item.updatedAt,
        };
      });

      await this.pushTable<LocalLecturer>('lecturers', db.lecturers, (item) => ({
        id: item.serverId,
        name: item.name,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt,
      }));
    } else {
      console.debug('Sync: Slow network detected. Prioritizing attendance records and queueing metadata.');
    }

    // Always push critical transactional data (attendance) regardless of network speed
    await this.pushTable<LocalAttendanceSession>('attendance_sessions', db.attendanceSessions, (item) => {
      if (!this.isValidUUID(item.courseId)) return null;
      return {
        id: item.serverId,
        course_id: item.courseId,
        date: item.date,
        title: item.title,
        lecturer_id: this.isValidUUID(item.lecturerId) ? item.lecturerId : null,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt,
      };
    });

    await this.pushTable<LocalAttendanceRecord>('attendance_records', db.attendanceRecords, (item) => {
      if (!this.isValidUUID(item.sessionId) || !this.isValidUUID(item.studentId)) return null;
      return {
        id: item.serverId,
        session_id: item.sessionId,
        student_id: item.studentId,
        status: item.status,
        marked_at: new Date(item.timestamp).toISOString(),
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt,
      };
    }, 'session_id,student_id');

    if (!isSlow) {
      await this.pushTable<LocalEnrollment>('enrollments', db.enrollments, (item) => {
        if (!this.isValidUUID(item.courseId) || !this.isValidUUID(item.studentId)) return null;
        return {
          id: item.serverId,
          student_id: item.studentId,
          course_id: item.courseId,
          user_id: this.userId,
          is_deleted: item.isDeleted,
          updated_at: item.updatedAt,
        };
      }, 'student_id,course_id');

      await this.pushTable<LocalStudentCredential>('student_credentials', db.studentCredentials, (item) => {
        if (!this.isValidUUID(item.studentId)) return null;
        return {
          id: item.serverId,
          student_id: item.studentId,
          credential_id: item.credentialId,
          public_key: item.publicKey,
          counter: item.counter,
          user_id: this.userId,
          is_deleted: item.isDeleted,
          updated_at: item.updatedAt,
        };
      }, 'credential_id');

      await this.pushTable<LocalCourseSchedule>('course_schedules', db.courseSchedules, (item) => {
        if (!this.isValidUUID(item.courseId)) return null;
        return {
          id: item.serverId,
          course_id: item.courseId,
          day_of_week: item.dayOfWeek,
          start_time: item.startTime,
          end_time: item.endTime,
          user_id: this.userId,
          is_deleted: item.isDeleted,
          updated_at: item.updatedAt,
        };
      });
    }

    await this.flushBundle();
  }

  private async flushBundle() {
    if (this.globalBundle.length === 0) return;

    const bundleData = this.globalBundle.map(b => ({
      tableName: b.tableName,
      payload: b.payload
    }));

    try {
      const jsonStr = JSON.stringify(bundleData);
      const uint8Arr = new TextEncoder().encode(jsonStr);

      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(uint8Arr);
      writer.close();

      const response = new Response(cs.readable);
      const compressedData = await response.arrayBuffer();

      const { data: edgeResponse, error } = await supabase.functions.invoke('sync-bundle', {
        body: compressedData,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'deflate-raw'
        }
      });

      if (error) throw error;

      if (edgeResponse && edgeResponse.results) {
        for (const [index, result] of edgeResponse.results.entries()) {
          const bundleItem = this.globalBundle[index];
          const { data: returnedData, error: returnedError } = result;

          if (returnedError) {
            console.error(`Sync: Failed to push to ${bundleItem.tableName}:`, returnedError);
            for (const record of bundleItem.records) {
              const ob = bundleItem.outboxAttempts.get(record.serverId);
              if (ob) {
                await db.outbox.update(ob.id, { attempts: ob.entry.attempts + 1 }).catch(() => {});
              } else {
                await db.outbox.add({ tableName: bundleItem.tableName, serverId: record.serverId, attempts: 1, done: 0, operation: 'upsert', createdAt: new Date().toISOString() }).catch(() => {});
              }
            }
          } else if (returnedData && returnedData.length > 0) {
            const serverIds = (returnedData as Array<{ id: string }>).map(d => d.id);
            const successRecords = bundleItem.records.filter(r => serverIds.includes(r.serverId));

            const doneOutboxIds: number[] = [];
            for (const record of successRecords) {
              const ob = bundleItem.outboxAttempts.get((record as { serverId: string }).serverId);
              if (ob) doneOutboxIds.push(ob.id);
            }

            await Promise.all(doneOutboxIds.map(id => db.outbox.update(id, { done: 1 }).catch(() => {})));

            const successUpdates = successRecords.map((r, i) => ({
              key: r.id!,
              changes: { synced: 1, updatedAt: (returnedData as Array<{ updated_at?: string }>)[i]?.updated_at || r.updatedAt }
            }));
            try {
              await bundleItem.table.bulkUpdate(successUpdates);
            } catch (err: unknown) {
              if (err instanceof Error && (err.name === 'BulkError' || err.name === 'ConstraintError')) {
                 console.warn(`Sync: Ignoring error during bundle update (likely conflicts): `, (err as Error).message);
              } else {
                 throw err;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to flush sync bundle', err);
      throw err;
    } finally {
      this.globalBundle = [];
    }
  }
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
    conflictColumns?: string
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

      const existsOnServer = new Set(((serverRows ?? []) as Array<{ id: string }>).map(r => r.id));

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
        await this.executeUpsert(tableName, table, tombstonesToPush, mapFn, outboxAttempts, conflictColumns);
      }
    }

    // ── Push live records ─────────────────────────────────────────────────────
    if (liveRecords.length > 0) {
      await this.executeUpsert(tableName, table, liveRecords, mapFn, outboxAttempts, conflictColumns);
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
    conflictColumns?: string
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
      if (error.code === '23505' && conflictColumns) {
        // Unique constraint violation. Fallback to 1-by-1 upsert using the specific conflict columns,
        // omitting 'id' to adopt the canonical server ID if it already exists.
        for (let i = 0; i < payload.length; i++) {
          const itemPayload = { ...payload[i] };
          const originalLocalId = records[i].serverId;
          delete itemPayload.id; // Allow server to update existing row without ID conflict

          const { data: singleData, error: singleError } = await supabase
            .from(tableName)
            .upsert(itemPayload, { onConflict: conflictColumns })
            .select();

          if (singleError) {
            console.error(`Sync: Error pushing single record to ${tableName}`, singleError);
            const ob = outboxAttempts.get(originalLocalId);
            if (ob) await db.outbox.update(ob.id, { attempts: ob.entry.attempts + 1 }).catch(() => {});
          } else if (singleData && singleData.length > 0) {
            const serverItem = singleData[0];
            const localItem = records.find(u => u.serverId === originalLocalId);
            if (localItem) {
              await table.update(localItem.id!, {
                serverId: serverItem.id,
                synced: 1,
                updatedAt: serverItem.updated_at
              } as any);
              const ob = outboxAttempts.get(originalLocalId);
              if (ob) await db.outbox.update(ob.id, { done: 1 }).catch(() => {});
            }
          }
        }
      } else {
        console.error(`Sync: Error pushing to ${tableName}`, error);
        // Increment attempt counter for each failed record
        for (const record of records) {
          const ob = outboxAttempts.get(record.serverId);
          if (ob) {
            await db.outbox.update(ob.id, { attempts: ob.entry.attempts + 1 }).catch(() => {});
          }
        }
      }
    } else if (data) {
      const updates: { key: number; changes: { synced: number; updatedAt: string } }[] = [];
      const doneOutboxIds: number[] = [];

      const serverRows = data as Array<{ id: string; updated_at: string }>;
      for (const serverItem of serverRows) {
        const localItem = records.find(u => u.serverId === serverItem.id);
        if (!localItem) continue;
        updates.push({
          key: localItem.id!,
          changes: { synced: 1, updatedAt: serverItem.updated_at },
        });
        const ob = outboxAttempts.get(serverItem.id);
        if (ob) doneOutboxIds.push(ob.id);
      }

      if (updates.length > 0) {
        try {
          await (table as any).bulkUpdate(updates);
        } catch (err: unknown) {
          if (err instanceof Error && (err.name === 'BulkError' || err.name === 'ConstraintError')) {
             console.warn(`Sync: Ignoring error during update in pushTable (likely conflicts): `, (err as Error).message);
          } else {
             throw err;
          }
        }
      }
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
      const existsOnServer = new Set(((serverRows ?? []) as Array<{ id: string }>).map(r => r.id));

      const toPurge = tombstones.filter(t => !existsOnServer.has(t.serverId));
      if (toPurge.length > 0) await db.students.bulkDelete(toPurge.map(t => t.id!));

      const toPush = tombstones.filter(t => existsOnServer.has(t.serverId));
      if (toPush.length > 0) {
        const payload = toPush.map(item => ({
          id: item.serverId, reg_number: item.regNumber, name: item.name,
          email: item.email, phone: item.phone,

          user_id: this.userId,
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
                const ob = outboxAttempts.get(item.id);
                if (ob) await db.outbox.update(ob.id, { done: 1 }).catch(() => {});
              }
            }
          } else if (!singleError && singleData?.[0]) {
            const localItem = liveRecords.find(u => u.serverId === singleData[0].id);
            if (localItem) {
              await db.students.update(localItem.id!, { synced: 1, updatedAt: singleData[0].updated_at });
              const ob = outboxAttempts.get(item.id);
              if (ob) await db.outbox.update(ob.id, { done: 1 }).catch(() => {});
            }
          }
        }
      } else {
        console.error('Sync: Error pushing to students', error);
      }
    } else if (data) {
      const updates: { key: number; changes: { synced: number; updatedAt: string } }[] = [];
      const doneOutboxIds: number[] = [];
      const serverRows = data as Array<{ id: string; updated_at: string }>;
      for (const serverItem of serverRows) {
        const localItem = liveRecords.find(u => u.serverId === serverItem.id);
        if (localItem) {
          updates.push({ key: localItem.id!, changes: { synced: 1, updatedAt: serverItem.updated_at } });
          const ob = outboxAttempts.get(serverItem.id);
          if (ob) doneOutboxIds.push(ob.id);
        }
      }
      if (updates.length > 0) {
        try {
          await db.students.bulkUpdate(updates);
        } catch (err: unknown) {
          if (err instanceof Error && (err.name === 'BulkError' || err.name === 'ConstraintError')) {
             console.warn(`Sync: Ignoring error during student update (likely conflicts): `, (err as Error).message);
          } else {
             throw err;
          }
        }
      }
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
      try {
        await db.courses.bulkUpdate(brokenCourses.map(c => ({
          key: c.id!,
          changes: { semesterId: activeSemester!.serverId, synced: 0 },
        })));
      } catch (err: unknown) {
         if (err instanceof Error && (err.name === 'BulkError' || err.name === 'ConstraintError')) {
             console.warn(`Sync: Ignoring error during course update (likely conflicts): `, (err as Error).message);
          } else {
             throw err;
          }
      }
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
      lecturers: 'lecturers',
      course_schedules: 'courseSchedules',
      student_credentials: 'studentCredentials',
    };


    const tables = db as unknown as Record<string, Table<LocalSyncRecord, number>>;
    for (const dexieName of Object.values(tableMapping)) {
      const table = tables[dexieName];
      const toPurge: number[] = await table
        .filter(r => r.isDeleted === 1 && r.synced === 1)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('attendance_records', db.attendanceRecords, payload))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('attendance_sessions', db.attendanceSessions, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lecturers', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('lecturers', db.lecturers, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('students', db.students, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('courses', db.courses, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'semesters', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('semesters', db.semesters, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('enrollments', db.enrollments, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_schedules', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('course_schedules', db.courseSchedules, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_credentials', filter: `user_id=eq.${this.userId}` }, payload => this.handleRealtimeEvent('student_credentials', db.studentCredentials, payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel connected or reconnected → run a catch-up pull to close
          // any gap in coverage while the WebSocket was down.
          console.log('Sync: Realtime channel connected/reconnected, running catch-up pull.');
          this.pullChanges().catch(e => console.error('Sync: Catch-up pull failed', e));
        }
      });
  }

  public async handleRealtimeEvent<T extends LocalSyncRecord>(tableName: TableName, table: Table<any  , number>, payload: RealtimePayload) {
    const { eventType } = payload;
    const newRecord = payload.new as ServerRow;
    const oldRecord = payload.old as ServerRow;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const localItem = await table.where('serverId').equals(newRecord.id).first();

      if (localItem && localItem.synced === 0) {
        // Pending local write: apply LWW
        const serverTs = newRecord.updated_at ?? '';
        const localTs = localItem.updatedAt ?? '';
        if (serverTs <= localTs) return; // local is newer, do nothing
      }

      const mapped = this.mapServerToLocal(tableName, newRecord) as Partial<T>;

      if (localItem && localItem.id !== undefined) {
        await table.update(localItem.id, { ...mapped, synced: 1 } as any);
      } else {
        // Heavy tables: only insert via periodic pull to avoid bloating local storage
        const isHeavy = tableName === 'attendance_records' || tableName === 'attendance_sessions';
        if (!isHeavy) {
          await table.add({ ...mapped, synced: 1 } as T);
        }
      }
    } else if (eventType === 'DELETE') {
      // Physical deletes from Supabase CDC should be treated as soft-deletes locally.
      // The app uses tombstones; hard-deleting would bypass the purge and leave data inconsistencies.
      const localItem = await table.where('serverId').equals(oldRecord.id).first();
      if (!localItem) return;
      if (localItem.synced === 0) return; // unsynced local change takes precedence

      // Mark as soft-deleted + synced (will be purged by meticulousPurge on next sync)
      if (localItem.id !== undefined) {
        await table.update(localItem.id, { isDeleted: 1, synced: 1 } as any);
      }
    }
  }

  private mapServerToLocal(tableName: TableName, r: ServerRow): Record<string, unknown> {
    const base = {
      serverId: r.id,
      userId: typeof r.user_id === 'string' ? r.user_id : undefined,
      isDeleted: typeof r.is_deleted === 'number' ? r.is_deleted : 0,
      updatedAt: typeof r.updated_at === 'string' ? r.updated_at : undefined,
    };
    switch (tableName) {
      case 'semesters':
        return {
          ...base,
          name: String(r.name ?? ''),
          startDate: String(r.start_date ?? ''),
          endDate: String(r.end_date ?? ''),
          isActive: Boolean(r.is_active),
          isArchived: Boolean(r.is_archived)
        };
      case 'students':
        return {
          ...base,
          regNumber: String(r.reg_number ?? ''),
          name: String(r.name ?? ''),
          email: typeof r.email === 'string' ? r.email : undefined,
          phone: typeof r.phone === 'string' ? r.phone : undefined
        };
      case 'courses':
        return {
          ...base,
          code: String(r.code ?? ''),
          title: String(r.title ?? ''),
          semesterId: String(r.semester_id ?? ''),
          // Legacy schema used `day`; newer migrations may use `day_of_week`.
          dayOfWeek: (r.day_of_week ?? r.day) ? String(r.day_of_week ?? r.day) : undefined,
          time: r.time ? String(r.time) : undefined,
          lecturers: r.lecturers ? String(r.lecturers) : undefined,
        };
      case 'lecturers':
        return { ...base, name: String(r.name ?? '') };
      case 'course_schedules':
        return {
          ...base,
          courseId: String(r.course_id ?? ''),
          dayOfWeek: String(r.day_of_week ?? ''),
          startTime: String(r.start_time ?? ''),
          endTime: String(r.end_time ?? '')
        };
      case 'enrollments':
        return { ...base, studentId: String(r.student_id ?? ''), courseId: String(r.course_id ?? '') };
      case 'attendance_sessions':
        return {
          ...base,
          courseId: String(r.course_id ?? ''),
          date: String(r.date ?? ''),
          title: String(r.title ?? ''),
          lecturerId: r.lecturer_id ? String(r.lecturer_id) : undefined
        };
      case 'attendance_records':
        {
          const markedAt = r.marked_at;
        return {
            ...base,
            sessionId: String(r.session_id ?? ''),
            studentId: String(r.student_id ?? ''),
            status: String(r.status ?? ''),
            // marked_at may be BIGINT (legacy) or TIMESTAMPTZ (after migration) — handle both
            timestamp: typeof markedAt === 'number' ? markedAt : new Date(String(markedAt)).getTime(),
        };
        }
      case 'student_credentials':
        return {
          ...base,
          studentId: String(r.student_id ?? ''),
          credentialId: String(r.credential_id ?? ''),
          publicKey: String(r.public_key ?? ''),
          counter: typeof r.counter === 'number' ? r.counter : 0,
        };
      default:
        return base;
    }
  }
}

export const realtimeSync = new RealtimeSyncEngine();
