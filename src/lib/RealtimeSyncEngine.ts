import { db, type LocalSemester, type LocalStudent, type LocalCourse, type LocalEnrollment, type LocalAttendanceSession, type LocalAttendanceRecord } from '../db/db';
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'semesters' | 'students' | 'courses' | 'enrollments' | 'attendance_sessions' | 'attendance_records';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Network-aware debounce defaults
const DEBOUNCE_MAP: Record<string, number> = {
  '4g': 2000,
  '3g': 5000,
  '2g': 10000,
  'slow-2g': 15000,
};

export class RealtimeSyncEngine {
  private userId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private isSyncing = false;
  private isInitialized = false;
  private debounceTimer: any = null;
  private retryCount = 0;
  private maxRetries = 3;
  private currentStatus: SyncStatus = 'idle';
  private statusListeners: ((status: SyncStatus) => void)[] = [];

  constructor() {
    this.setupNetworkListeners();
    db.onLocalChange(() => this.triggerSync());
  }

  /** Subscribe to sync status changes. Returns an unsubscribe function. */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(callback);
    // Immediately emit the current status to the new subscriber
    callback(this.currentStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== callback);
    };
  }

  private emitStatus(status: SyncStatus) {
    this.currentStatus = status;
    this.statusListeners.forEach(l => l(status));
  }

  /** Reset the engine state and unsubscribe from realtime. Call on user sign-out. */
  cleanup() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.userId = null;
    this.isInitialized = false;
    this.isSyncing = false;
    this.retryCount = 0;
    this.emitStatus('idle');
  }

  /** Get network-aware debounce delay */
  private getDebounceDelay(): number {
    const conn = (navigator as any).connection;
    const effectiveType = conn?.effectiveType || '4g';
    return DEBOUNCE_MAP[effectiveType] || 2000;
  }

  // Reactive Sync: Call this whenever local data changes
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
    
    console.log('Sync: Initialized');
    await this.sync();
    this.setupRealtimeSubscription();
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.retryCount = 0; // Reset retry count when coming back online
      this.sync();
    });
    window.addEventListener('offline', () => {
      this.emitStatus('offline');
    });
  }

  async sync() {
    if (!this.userId || !navigator.onLine || this.isSyncing) return;
    this.isSyncing = true;
    this.emitStatus('syncing');

    try {
      // 1. Pull first to ensure we have parents (Semesters) for our orphans
      await this.pullChanges();
      // 2. Fix malformed IDs using the data we just pulled (or existing local data)
      await this.selfHealData(); 
      // 3. Push the fixed/healed data
      await this.pushChanges();
      
      await this.meticulousPurge();
      this.retryCount = 0; // Reset on success
      this.emitStatus('synced');
    } catch (error) {
      console.error('Sync: Failed', error);
      // Retry with exponential backoff
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const backoffMs = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        console.log(`Sync: Retrying in ${backoffMs}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.sync(), backoffMs);
      } else {
        console.error(`Sync: Max retries (${this.maxRetries}) reached. Will retry on next trigger.`);
        this.emitStatus('error');
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private isValidUUID(uuid: any) {
    if (!uuid || typeof uuid !== 'string') return false;
    return UUID_REGEX.test(uuid);
  }

  /**
   * Automatically fixes local records that have numeric IDs instead of UUIDs
   * by mapping them to the current active semester/entities.
   */
  private async selfHealData() {
    let activeSemester = await db.semesters.filter(s => s.isActive).first();
    
    // Fallback: If no active semester, use the most recent one
    if (!activeSemester) {
        activeSemester = await db.semesters.orderBy('endDate').reverse().first();
    }

    if (!activeSemester || !this.isValidUUID(activeSemester.serverId)) {
        // Downgrade to debug — this is normal on first sync before any semesters exist
        console.debug('Sync: No valid semester found for self-healing (normal if first sync).');
        return;
    }

    // 1. Fix Courses with numeric semesterId or invalid UUID
    const brokenCourses = await db.courses.toArray();
    const coursesToFix = brokenCourses.filter(c => !this.isValidUUID(c.semesterId));
    
    if (coursesToFix.length > 0) {
        console.log(`Sync: Self-healing ${coursesToFix.length} courses to semester ${activeSemester.name}...`);
        await db.courses.bulkUpdate(coursesToFix.map(c => ({
            key: c.id!,
            changes: { semesterId: activeSemester!.serverId, synced: 0 }
        })));
    }

    // 2. Fix Sessions with numeric courseId
    const brokenSessions = await db.attendanceSessions.filter(s => !this.isValidUUID(s.courseId)).toArray();
    for (const session of brokenSessions) {
        // Try to find the course locally by its local numeric ID if it was stored that way
        const course = await db.courses.get(Number(session.courseId));
        if (course && this.isValidUUID(course.serverId)) {
            await db.attendanceSessions.update(session.id!, { courseId: course.serverId, synced: 0 });
        }
    }
  }

  private async meticulousPurge() {
    const tableMapping: Record<TableName, string> = {
        semesters: 'semesters',
        students: 'students',
        courses: 'courses',
        enrollments: 'enrollments',
        attendance_sessions: 'attendanceSessions',
        attendance_records: 'attendanceRecords'
    };

    for (const [_apiName, dexieName] of Object.entries(tableMapping)) {
        const table = (db as any)[dexieName];
        const toPurge = await table.filter((r: any) => r.isDeleted === 1 && r.synced === 1).primaryKeys();
        if (toPurge.length > 0) {
            await table.bulkDelete(toPurge);
        }
    }

    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const oldRecords = await db.attendanceRecords
        .filter((r) => r.synced === 1 && r.timestamp < oneDayAgo)
        .primaryKeys();
    
    if (oldRecords.length > 0) {
        await db.attendanceRecords.bulkDelete(oldRecords);
    }

    const oldSessions = await db.attendanceSessions
        .filter((s) => s.synced === 1 && new Date(s.date).getTime() < oneDayAgo)
        .toArray();
    
    for (const session of oldSessions) {
        const localCount = await db.attendanceRecords.where('sessionId').equals(session.serverId).count();
        if (localCount === 0) {
            await db.attendanceSessions.delete(session.id!);
        }
    }
  }

  private async pushChanges() {
    if (!this.userId) return;

    // Push Semesters
    await this.pushTable<LocalSemester>('semesters', db.semesters, (item) => ({
      id: item.serverId,
      name: item.name,
      start_date: item.startDate,
      end_date: item.endDate,
      is_active: item.isActive,
      is_archived: item.isArchived,
      user_id: this.userId,
      is_deleted: item.isDeleted,
      updated_at: item.updatedAt
    }));

    // Push Students — deduplicate by reg_number before pushing
    await this.pushStudents();

    // Push Courses
    await this.pushTable<LocalCourse>('courses', db.courses, (item) => {
      if (!this.isValidUUID(item.semesterId)) return null;
      return {
        id: item.serverId,
        code: item.code,
        title: item.title,
        semester_id: item.semesterId,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt
      };
    });

    // Push Enrollments
    await this.pushTable<LocalEnrollment>('enrollments', db.enrollments, (item) => {
      if (!this.isValidUUID(item.studentId) || !this.isValidUUID(item.courseId)) return null;
      return {
        id: item.serverId,
        student_id: item.studentId,
        course_id: item.courseId,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt
      };
    });

    // Push Sessions
    await this.pushTable<LocalAttendanceSession>('attendance_sessions', db.attendanceSessions, (item) => {
      if (!this.isValidUUID(item.courseId)) return null;
      return {
        id: item.serverId,
        course_id: item.courseId,
        date: item.date,
        title: item.title,
        user_id: this.userId,
        is_deleted: item.isDeleted,
        updated_at: item.updatedAt
      };
    });

    // Push Records
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
        updated_at: item.updatedAt
      };
    });
  }

  /**
   * Special push for students: handles duplicate reg_number conflicts gracefully.
   * Instead of letting the DB throw a unique constraint error, we deduplicate locally
   * and use ignoreDuplicates to avoid 23505 errors.
   */
  private async pushStudents() {
    const unsynced = await db.students.filter((i) => i.synced === 0).toArray();
    if (unsynced.length === 0) return;

    // Deduplicate: if multiple local records have the same regNumber, keep the newest
    const regMap = new Map<string, LocalStudent>();
    for (const student of unsynced) {
      const existing = regMap.get(student.regNumber);
      if (!existing || (student.updatedAt && existing.updatedAt && student.updatedAt > existing.updatedAt)) {
        regMap.set(student.regNumber, student);
      }
    }
    const deduped = Array.from(regMap.values());

    const payload = deduped.map((item) => ({
      id: item.serverId,
      reg_number: item.regNumber,
      name: item.name,
      email: item.email,
      phone: item.phone,
      user_id: this.userId,
      is_deleted: item.isDeleted,
      updated_at: item.updatedAt
    }));

    if (payload.length === 0) return;

    // Use upsert with onConflict on 'id' (the primary key UUID).
    // If the same reg_number already exists with a different serverId, 
    // we push one-by-one to handle conflicts gracefully.
    const { data, error } = await supabase.from('students').upsert(payload, { onConflict: 'id', ignoreDuplicates: false }).select();

    if (error) {
      // If batch fails due to duplicate reg_number, fall back to one-by-one upsert
      if (error.code === '23505') {
        console.warn('Sync: Batch student push hit duplicate constraint, falling back to individual upserts.');
        for (const item of payload) {
          const { data: singleData, error: singleError } = await supabase
            .from('students')
            .upsert(item, { onConflict: 'id' })
            .select();
          
          if (singleError) {
            // If it's a reg_number conflict, try to find existing and update the serverId locally
            if (singleError.code === '23505') {
              const { data: existing } = await supabase
                .from('students')
                .select('id')
                .eq('reg_number', item.reg_number)
                .eq('user_id', this.userId)
                .single();
              
              if (existing) {
                // Update local record to use the server's existing UUID
                const localItem = unsynced.find(u => u.serverId === item.id);
                if (localItem) {
                  await db.students.update(localItem.id!, { serverId: existing.id, synced: 1 });
                }
              }
            } else {
              console.error(`Sync: Error pushing student ${item.reg_number}`, singleError);
            }
          } else if (singleData && singleData[0]) {
            const localItem = unsynced.find(u => u.serverId === singleData[0].id);
            if (localItem) {
              await db.students.update(localItem.id!, { synced: 1, updatedAt: singleData[0].updated_at });
            }
          }
        }
      } else {
        console.error('Sync: Error pushing to students', error);
      }
    } else if (data) {
      // Server Authority: Update local records with server's true timestamp and mark as synced
      const updates: { key: number; changes: { synced: number; updatedAt: string } }[] = [];
      for (const serverItem of data as any[]) {
        const localItem = unsynced.find((u) => u.serverId === serverItem.id);
        if (localItem) {
          updates.push({ key: localItem.id!, changes: { synced: 1, updatedAt: serverItem.updated_at } });
        }
      }

      if (updates.length > 0) {
        await db.students.bulkUpdate(updates);
      }
    }
  }

  private async pushTable<T extends { id?: number; synced: number; updatedAt?: string; serverId: string }>(
    tableName: TableName,
    table: any,
    mapFn: (item: T) => any
  ) {
    const unsynced = await table.filter((i: T) => i.synced === 0).toArray();
    if (unsynced.length === 0) return;

    const payload = unsynced.map(mapFn).filter((p: any): p is NonNullable<typeof p> => p !== null);
    
    if (unsynced.length > payload.length) {
        const skipped = unsynced.length - payload.length;
        console.debug(`Sync: Filtered ${skipped} items in ${tableName} with invalid foreign keys (awaiting parent sync).`);
    }

    if (payload.length === 0) return;

    const { data, error } = await supabase.from(tableName).upsert(payload).select();

    if (error) {
      console.error(`Sync: Error pushing to ${tableName}`, error);
      // Don't mark as synced on error — this is critical for data integrity
    } else if (data) {
      // Server Authority: Update local records with server's true timestamp and mark as synced
      const updates = data.map((serverItem: any) => {
        const localItem = unsynced.find((u: any) => u.serverId === serverItem.id);
        if (!localItem) return null;
        return {
          key: localItem.id!,
          changes: { synced: 1, updatedAt: serverItem.updated_at }
        };
      }).filter((u: any) => u !== null);

      if (updates.length > 0) {
        await table.bulkUpdate(updates);
      }
    }
  }

  private async pullChanges() {
    if (!this.userId) return;
    
    const lastSync = localStorage.getItem('last_sync_timestamp');
    const since = lastSync ? new Date(parseInt(lastSync)).toISOString() : new Date(0).toISOString();
    const isFreshSync = !lastSync || lastSync === '0';
    
    // Integrity Check: If we have no semesters locally, force a fresh pull for them
    const localSemesterCount = await db.semesters.count();
    const semesterSince = localSemesterCount === 0 ? new Date(0).toISOString() : since;

    const pull = async (tableName: TableName, table: any, mapToLocal: (serverItem: any) => any, customSince?: string): Promise<boolean> => {
        const isHeavy = ['attendance_records', 'attendance_sessions'].includes(tableName);
        let query = supabase.from(tableName).select('*').eq('user_id', this.userId).gt('updated_at', customSince || since);
        
        // Smart Pull: On fresh sync, ignore deleted history to prevent "Zombie" accumulation
        if (isFreshSync || (customSince && customSince === new Date(0).toISOString())) {
            query = query.eq('is_deleted', 0);
        }

        if (isHeavy && !isFreshSync) {
            const twoDaysAgo = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
            query = query.gt('created_at', twoDaysAgo);
        }

        const { data, error } = await query;
        if (error) {
          console.error(`Sync: Error pulling ${tableName}`, error);
          return false;
        }

        if (data && data.length > 0) {
            await db.transaction('rw', table, async () => {
                for (const item of data) {
                    const localItem = await table.where('serverId').equals(item.id).first();
                    
                    // Local-is-King: Never overwrite unsynced local changes with incoming server data
                    if (localItem && localItem.synced === 0) continue;

                    const mapped = mapToLocal(item);
                    if (localItem) {
                        await table.update(localItem.id, { ...mapped, synced: 1 });
                    } else {
                        await table.add({ ...mapped, synced: 1 });
                    }
                }
            });
        }
        return true;
    };

    const results = await Promise.all([
      pull('semesters', db.semesters, (s) => ({
          serverId: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, isActive: s.is_active, isArchived: s.is_archived, userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at
      }), semesterSince),
      pull('students', db.students, (s) => ({
          serverId: s.id, regNumber: s.reg_number, name: s.name, email: s.email, phone: s.phone, userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at
      })),
      pull('courses', db.courses, (c) => ({
          serverId: c.id, code: c.code, title: c.title, semesterId: c.semester_id, userId: c.user_id, isDeleted: c.is_deleted, updatedAt: c.updated_at
      })),
      pull('enrollments', db.enrollments, (e) => ({
          serverId: e.id, studentId: e.student_id, courseId: e.course_id, userId: e.user_id, isDeleted: e.is_deleted, updatedAt: e.updated_at
      })),
      pull('attendance_sessions', db.attendanceSessions, (s) => ({
          serverId: s.id, courseId: s.course_id, date: s.date, title: s.title, userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at
      })),
      pull('attendance_records', db.attendanceRecords, (r) => ({
          serverId: r.id, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at, userId: r.user_id, isDeleted: r.is_deleted, updatedAt: r.updated_at
      })),
    ]);

    // Only advance the timestamp if ALL tables pulled successfully.
    // If any failed, we keep the old timestamp so the next sync retries those records.
    const allSucceeded = results.every(Boolean);
    if (allSucceeded) {
      localStorage.setItem('last_sync_timestamp', Date.now().toString());
    } else {
      console.warn('Sync: One or more tables failed to pull. Timestamp not advanced — will retry on next sync.');
    }
  }

  private setupRealtimeSubscription() {
    if (!this.userId) return;
    if (this.channel) this.channel.unsubscribe();

    this.channel = supabase.channel('db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `user_id=eq.${this.userId}` }, (payload) => this.handleRealtimeEvent('attendance_records', db.attendanceRecords, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions', filter: `user_id=eq.${this.userId}` }, (payload) => this.handleRealtimeEvent('attendance_sessions', db.attendanceSessions, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `user_id=eq.${this.userId}` }, (payload) => this.handleRealtimeEvent('students', db.students, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `user_id=eq.${this.userId}` }, (payload) => this.handleRealtimeEvent('courses', db.courses, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'semesters', filter: `user_id=eq.${this.userId}` }, (payload) => this.handleRealtimeEvent('semesters', db.semesters, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments', filter: `user_id=eq.${this.userId}` }, (payload) => this.handleRealtimeEvent('enrollments', db.enrollments, payload))
      .subscribe();
  }

  private async handleRealtimeEvent(tableName: string, table: any, payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const localItem = await table.where('serverId').equals(newRecord.id).first();
        
        // Local-is-King: Ignore incoming realtime updates if we have unsynced local changes
        if (localItem && localItem.synced === 0) return;

        const mapped = this.mapServerToLocal(tableName, newRecord);
        if (localItem) {
             await table.update(localItem.id, { ...mapped, synced: 1 });
        } else {
             // Heavy tables (attendance_sessions, attendance_records) are subscribed for UPDATE/DELETE
             // but new records are not inserted locally via realtime to avoid bloating local storage
             // with all historical data. New sessions/records arrive via the periodic pull instead.
             const isHeavy = ['attendance_records', 'attendance_sessions'].includes(tableName);
             if (!isHeavy) {
                await table.add({ ...mapped, synced: 1 });
             }
        }
    } else if (eventType === 'DELETE') {
        const localItem = await table.where('serverId').equals(oldRecord.id).first();
        // Local-is-King: Don't delete if we have unsynced local changes (rare conflict, but safe)
        if (localItem && localItem.synced === 0) return;
        
        if (localItem) await table.delete(localItem.id);
    }
  }

  private mapServerToLocal(tableName: string, r: any) {
      const base = { serverId: r.id, userId: r.user_id, isDeleted: r.is_deleted, updatedAt: r.updated_at };
      switch (tableName) {
          case 'semesters': return { ...base, name: r.name, startDate: r.start_date, endDate: r.end_date, isActive: r.is_active, isArchived: r.is_archived };
          case 'students': return { ...base, regNumber: r.reg_number, name: r.name, email: r.email, phone: r.phone };
          case 'courses': return { ...base, code: r.code, title: r.title, semesterId: r.semester_id };
          case 'enrollments': return { ...base, studentId: r.student_id, courseId: r.course_id };
          case 'attendance_sessions': return { ...base, courseId: r.course_id, date: r.date, title: r.title };
          case 'attendance_records': return { ...base, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at };
          default: return base;
      }
  }
}

export const realtimeSync = new RealtimeSyncEngine();
