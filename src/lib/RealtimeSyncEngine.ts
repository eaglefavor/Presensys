import { db, LocalSemester, LocalStudent, LocalCourse, LocalEnrollment, LocalAttendanceSession, LocalAttendanceRecord } from '../db/db';
import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'semesters' | 'students' | 'courses' | 'enrollments' | 'attendance_sessions' | 'attendance_records';

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
    
    // 1. Initial Sync (Pull differences)
    await this.sync();

    // 2. Setup Realtime Subscription
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
      await this.pushChanges(); // Push local changes first
      await this.pullChanges(); // Then pull server changes
      await this.garbageCollect();
      console.log('Sync: Completed.');
    } catch (error) {
      console.error('Sync: Failed', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushChanges() {
    if (!this.userId) return;

    // Push Semesters
    await this.pushTable<LocalSemester>('semesters', db.semesters, (item) => ({
      id: item.server_id,
      name: item.name,
      start_date: item.start_date,
      end_date: item.end_date,
      is_active: item.is_active,
      is_archived: item.is_archived,
      user_id: this.userId,
      is_deleted: item.is_deleted,
      updated_at: item.updated_at
    }));

    // Push Students
    await this.pushTable<LocalStudent>('students', db.students, (item) => ({
      id: item.server_id,
      reg_number: item.reg_number,
      name: item.name,
      email: item.email,
      phone: item.phone,
      user_id: this.userId,
      is_deleted: item.is_deleted,
      updated_at: item.updated_at
    }));

    // Push Courses
    await this.pushTable<LocalCourse>('courses', db.courses, (item) => ({
      id: item.server_id,
      code: item.code,
      title: item.title,
      semester_id: item.semester_id,
      user_id: this.userId,
      is_deleted: item.is_deleted,
      updated_at: item.updated_at
    }));

    // Push Enrollments
    await this.pushTable<LocalEnrollment>('enrollments', db.enrollments, (item) => ({
      id: item.server_id,
      student_id: item.student_id,
      course_id: item.course_id,
      user_id: this.userId,
      is_deleted: item.is_deleted,
      updated_at: item.updated_at
    }));

    // Push Sessions
    await this.pushTable<LocalAttendanceSession>('attendance_sessions', db.attendanceSessions, (item) => ({
      id: item.server_id,
      course_id: item.course_id,
      date: item.date,
      title: item.title,
      user_id: this.userId,
      is_deleted: item.is_deleted,
      updated_at: item.updated_at
    }));

    // Push Records
    await this.pushTable<LocalAttendanceRecord>('attendance_records', db.attendanceRecords, (item) => ({
      id: item.server_id,
      session_id: item.session_id,
      student_id: item.student_id,
      status: item.status,
      marked_at: item.marked_at,
      user_id: this.userId,
      is_deleted: item.is_deleted,
      updated_at: item.updated_at
    }));
  }

  private async pushTable<T extends { id?: number; synced_at: number; updated_at?: string; server_id: string }>(
    tableName: TableName,
    table: any,
    mapFn: (item: T) => any
  ) {
    const unsynced = await table.filter((i: T) => i.synced_at === 0).toArray();
    if (unsynced.length === 0) return;

    console.log(`Sync: Pushing ${unsynced.length} changes to ${tableName}`);

    const payload = unsynced.map(mapFn);
    
    // Upsert to Supabase
    const { error } = await supabase.from(tableName).upsert(payload);

    if (error) {
      console.error(`Sync: Error pushing to ${tableName}`, error);
    } else {
      // Mark as synced locally
      const now = Date.now();
      await table.bulkUpdate(unsynced.map((i: T) => ({ key: i.id!, changes: { synced_at: now } })));
    }
  }

  private async pullChanges() {
    if (!this.userId) return;
    
    // We can optimize this later to only pull updated_at > last_sync_timestamp
    // For now, we'll pull everything that changed recently or use the 'synced_at' logic roughly if we stored a global sync cursor.
    // Ideally, we'd store a 'last_sync_timestamp' in localStorage.

    const lastSync = localStorage.getItem('last_sync_timestamp');
    const since = lastSync ? new Date(parseInt(lastSync)).toISOString() : new Date(0).toISOString();

    // Helper to pull table
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
            console.log(`Sync: Pulled ${data.length} updates for ${tableName}`);
            await db.transaction('rw', table, async () => {
                for (const item of data) {
                    const localItem = await table.where('server_id').equals(item.id).first();
                    const mapped = mapToLocal(item);
                    
                    if (localItem) {
                        // Conflict resolution: Server wins if timestamps differ significantly? 
                        // For now, Server Always Wins on Pull.
                        await table.update(localItem.id, { ...mapped, synced_at: Date.now() });
                    } else {
                        await table.add({ ...mapped, synced_at: Date.now() });
                    }
                }
            });
        }
    };

    // Pull in order (though with UUIDs order matters less for referential integrity during insert if we just store strings, but for UI it helps)
    await pull('semesters', db.semesters, (s) => ({
        server_id: s.id, name: s.name, start_date: s.start_date, end_date: s.end_date, is_active: s.is_active, is_archived: s.is_archived, user_id: s.user_id, is_deleted: s.is_deleted, updated_at: s.updated_at
    }));
    await pull('students', db.students, (s) => ({
        server_id: s.id, reg_number: s.reg_number, name: s.name, email: s.email, phone: s.phone, user_id: s.user_id, is_deleted: s.is_deleted, updated_at: s.updated_at
    }));
    await pull('courses', db.courses, (c) => ({
        server_id: c.id, code: c.code, title: c.title, semester_id: c.semester_id, user_id: c.user_id, is_deleted: c.is_deleted, updated_at: c.updated_at
    }));
    await pull('enrollments', db.enrollments, (e) => ({
        server_id: e.id, student_id: e.student_id, course_id: e.course_id, user_id: e.user_id, is_deleted: e.is_deleted, updated_at: e.updated_at
    }));
    await pull('attendance_sessions', db.attendanceSessions, (s) => ({
        server_id: s.id, course_id: s.course_id, date: s.date, title: s.title, user_id: s.user_id, is_deleted: s.is_deleted, updated_at: s.updated_at
    }));
    await pull('attendance_records', db.attendanceRecords, (r) => ({
        server_id: r.id, session_id: r.session_id, student_id: r.student_id, status: r.status, marked_at: r.marked_at, user_id: r.user_id, is_deleted: r.is_deleted, updated_at: r.updated_at
    }));

    localStorage.setItem('last_sync_timestamp', Date.now().toString());
  }

  private setupRealtimeSubscription() {
    if (this.channel) this.channel.unsubscribe();

    this.channel = supabase.channel('db_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `user_id=eq.${this.userId}` },
        (payload) => this.handleRealtimeEvent('attendance_records', db.attendanceRecords, payload)
      )
      // Add other tables as needed. Doing all might be heavy, but for this app it's fine.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_sessions', filter: `user_id=eq.${this.userId}` },
        (payload) => this.handleRealtimeEvent('attendance_sessions', db.attendanceSessions, payload)
      )
       .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students', filter: `user_id=eq.${this.userId}` },
        (payload) => this.handleRealtimeEvent('students', db.students, payload)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
             console.log('Realtime: Subscribed!');
        }
      });
  }

  private async handleRealtimeEvent(tableName: string, table: any, payload: any) {
    console.log(`Realtime: Update received for ${tableName}`, payload);
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const localItem = await table.where('server_id').equals(newRecord.id).first();
        const mapped = this.mapServerToLocal(tableName, newRecord);
        
        if (localItem) {
             // Avoid loop: if the update matches exactly what we have (timestamp check?), ignore.
             // But usually safer to just update.
             await table.update(localItem.id, { ...mapped, synced_at: Date.now() });
        } else {
             await table.add({ ...mapped, synced_at: Date.now() });
        }
    } else if (eventType === 'DELETE') {
        // Hard delete on server -> Mark deleted locally or Hard delete locally?
        // Since we soft delete usually, a hard delete means "Purge".
        const localItem = await table.where('server_id').equals(oldRecord.id).first();
        if (localItem) {
            await table.delete(localItem.id);
        }
    }
  }

  private mapServerToLocal(tableName: string, r: any) {
      // Simple mapping based on table name
      const base = { server_id: r.id, user_id: r.user_id, is_deleted: r.is_deleted, updated_at: r.updated_at };
      switch (tableName) {
          case 'students': return { ...base, reg_number: r.reg_number, name: r.name, email: r.email, phone: r.phone };
          case 'attendance_sessions': return { ...base, course_id: r.course_id, date: r.date, title: r.title };
          case 'attendance_records': return { ...base, session_id: r.session_id, student_id: r.student_id, status: r.status, marked_at: r.marked_at };
          // ... Add others
          default: return base;
      }
  }

  private async garbageCollect() {
     // Clean up items marked is_deleted=1 AND synced_at > 0 (meaning server knows they are deleted)
     // Actually, if we soft delete on server, we keep them.
     // If we hard delete on server, we delete locally.
     
     // For this app, let's just leave them as soft deletes for history, 
     // but maybe remove them from Dexie if they are very old?
  }
}

export const realtimeSync = new RealtimeSyncEngine();
