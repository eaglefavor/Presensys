import { db, type LocalSemester, type LocalStudent, type LocalCourse, type LocalEnrollment, type LocalAttendanceSession, type LocalAttendanceRecord } from '../db/db';
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'semesters' | 'students' | 'courses' | 'enrollments' | 'attendance_sessions' | 'attendance_records';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RealtimeSyncEngine {
  private userId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private isSyncing = false;

  constructor() {
    this.setupNetworkListeners();
  }

  async initialize(userId: string) {
    this.userId = userId;
    console.log('Sync: Initializing for user', userId);
    await this.sync();
    this.setupRealtimeSubscription();
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('Sync: Online. Triggering sync.');
      this.sync();
    });
  }

  async sync() {
    if (!this.userId || !navigator.onLine || this.isSyncing) return;
    this.isSyncing = true;

    try {
      console.log('Sync: Starting...');
      await this.pushChanges();
      await this.pullChanges();
      console.log('Sync: Completed.');
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
      if (!this.isValidUUID(item.semesterId)) {
        console.error('Sync: Push Failed - Course missing valid Semester UUID', item);
        return null;
      }
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
      if (!this.isValidUUID(item.studentId) || !this.isValidUUID(item.courseId)) {
        console.error('Sync: Push Failed - Enrollment missing valid Student/Course UUID', item);
        return null;
      }
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
      if (!this.isValidUUID(item.courseId)) {
        console.error('Sync: Push Failed - Session missing valid Course UUID', item);
        return null;
      }
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
      if (!this.isValidUUID(item.sessionId) || !this.isValidUUID(item.studentId)) {
        console.error('Sync: Push Failed - Record missing valid Session/Student UUID', item);
        return null;
      }
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
    
    if (payload.length === 0) {
        // If they were all invalid, we DON'T mark as synced because we want to fix them.
        console.warn(`Sync: ${unsynced.length} records in ${tableName} were invalid and not pushed.`);
        return;
    }

    const { error } = await supabase.from(tableName).upsert(payload);

    if (error) {
      console.error(`Sync: Error pushing to ${tableName}`, error);
    } else {
      console.log(`Sync: Successfully pushed ${payload.length} records to ${tableName}`);
      await table.bulkUpdate(unsynced.map((i: T) => ({ key: i.id!, changes: { synced: 1 } })));
    }
  }

  private async pullChanges() {
    if (!this.userId) return;
    
    const lastSync = localStorage.getItem('last_sync_timestamp');
    const since = lastSync ? new Date(parseInt(lastSync)).toISOString() : new Date(0).toISOString();

    const pull = async (tableName: TableName, table: any, mapToLocal: (serverItem: any) => any) => {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', this.userId)
            .gt('updated_at', since);

        if (error) {
            console.error(`Sync: Error pulling ${tableName}`, error);
            return;
        }

        if (data && data.length > 0) {
            await db.transaction('rw', table, async () => {
                for (const item of data) {
                    const localItem = await table.where('serverId').equals(item.id).first();
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
        const mapped = this.mapServerToLocal(tableName, newRecord);
        if (localItem) {
             await table.update(localItem.id, { ...mapped, synced: 1 });
        } else {
             await table.add({ ...mapped, synced: 1 });
        }
    } else if (eventType === 'DELETE') {
        const localItem = await table.where('serverId').equals(oldRecord.id).first();
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
