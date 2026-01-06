import { db, type LocalSemester, type LocalStudent, type LocalCourse, type LocalEnrollment, type LocalAttendanceSession, type LocalAttendanceRecord } from '../db/db';
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'semesters' | 'students' | 'courses' | 'enrollments' | 'attendance_sessions' | 'attendance_records';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RealtimeSyncEngine {
  private userId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private isSyncing = false;
  private isInitialized = false;
  private debounceTimer: any = null;

  constructor() {
    this.setupNetworkListeners();
    db.onLocalChange(() => this.triggerSync());
  }

  // Reactive Sync: Call this whenever local data changes
  triggerSync() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.sync();
    }, 2000); // 2-second debounce to batch rapid changes
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
      this.sync();
    });
  }

  async sync() {
    if (!this.userId || !navigator.onLine || this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 1. Pull first to ensure we have parents (Semesters) for our orphans
      await this.pullChanges();
      // 2. Fix malformed IDs using the data we just pulled (or existing local data)
      await this.selfHealData(); 
      // 3. Push the fixed/healed data
      await this.pushChanges();
      
      await this.meticulousPurge();
    } catch (error) {
      console.error('Sync: Failed', error);
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
        console.warn('Sync: No valid semester found for self-healing.');
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

    // Push Students
    await this.pushTable<LocalStudent>('students', db.students, (item) => ({
      id: item.serverId,
      reg_number: item.regNumber,
      name: item.name,
      email: item.email,
      phone: item.phone,
      user_id: this.userId,
      is_deleted: item.isDeleted,
      updated_at: item.updatedAt
    }));

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

  private async pushTable<T extends { id?: number; synced: number; updatedAt?: string; serverId: string }>(
    tableName: TableName,
    table: any,
    mapFn: (item: T) => any
  ) {
    const unsynced = await table.filter((i: T) => i.synced === 0).toArray();
    if (unsynced.length === 0) return;

    const payload = unsynced.map(mapFn).filter((p: any): p is NonNullable<typeof p> => p !== null);
    
    if (unsynced.length > payload.length) {
        console.warn(`Sync: Skipped ${unsynced.length - payload.length} invalid items in ${tableName}. Check foreign keys.`);
    }

    if (payload.length === 0) return;

    const { data, error } = await supabase.from(tableName).upsert(payload).select();

    if (error) {
      console.error(`Sync: Error pushing to ${tableName}`, error);
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

    const pull = async (tableName: TableName, table: any, mapToLocal: (serverItem: any) => any) => {
        const isHeavy = ['attendance_records', 'attendance_sessions'].includes(tableName);
        let query = supabase.from(tableName).select('*').eq('user_id', this.userId).gt('updated_at', since);
        
        // Smart Pull: On fresh sync, ignore deleted history to prevent "Zombie" accumulation
        if (isFreshSync) {
            query = query.eq('is_deleted', 0);
        }

        if (isHeavy && !isFreshSync) {
            const twoDaysAgo = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
            query = query.gt('created_at', twoDaysAgo);
        }

        const { data, error } = await query;
        if (error) return;

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
    };

    await pull('semesters', db.semesters, (s) => ({
        serverId: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, isActive: s.is_active, isArchived: s.is_archived, userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at
    }));
    await pull('students', db.students, (s) => ({
        serverId: s.id, regNumber: s.reg_number, name: s.name, email: s.email, phone: s.phone, userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at
    }));
    await pull('courses', db.courses, (c) => ({
        serverId: c.id, code: c.code, title: c.title, semesterId: c.semester_id, userId: c.user_id, isDeleted: c.is_deleted, updatedAt: c.updated_at
    }));
    await pull('enrollments', db.enrollments, (e) => ({
        serverId: e.id, studentId: e.student_id, courseId: e.course_id, userId: e.user_id, isDeleted: e.is_deleted, updatedAt: e.updated_at
    }));
    await pull('attendance_sessions', db.attendanceSessions, (s) => ({
        serverId: s.id, courseId: s.course_id, date: s.date, title: s.title, userId: s.user_id, isDeleted: s.is_deleted, updatedAt: s.updated_at
    }));
    await pull('attendance_records', db.attendanceRecords, (r) => ({
        serverId: r.id, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at, userId: r.user_id, isDeleted: r.is_deleted, updatedAt: r.updated_at
    }));

    localStorage.setItem('last_sync_timestamp', Date.now().toString());
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
          case 'attendance_sessions': return { ...base, course_id: r.course_id, date: r.date, title: r.title };
          case 'attendance_records': return { ...base, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at };
          default: return base;
      }
  }
}

export const realtimeSync = new RealtimeSyncEngine();
