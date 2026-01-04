import { db } from '../db/db';
import { supabase } from './supabase';

export const syncEngine = {
  async syncAll() {
    if (!navigator.onLine) return { success: false, message: 'Offline' };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, message: 'No User' };

    try {
      console.log('Sync: Starting for user', user.id);
      await this.pushToCloud(user.id);
      await this.pullFromCloud(user.id);
      console.log('Sync: Completed');
      return { success: true };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  },

  async pushToCloud(userId: string) {
    await this.pushTable(db.students, 'students', (s) => ({
      reg_number: s.regNumber, name: s.name, email: s.email, phone: s.phone, user_id: userId, last_modified: s.lastModified, is_deleted: s.isDeleted
    }), 'reg_number');
    
    await this.pushTable(db.semesters, 'semesters', (s) => ({
      id: s.id, name: s.name, start_date: s.startDate, end_date: s.endDate, is_active: s.isActive, is_archived: s.isArchived, user_id: userId, last_modified: s.lastModified, is_deleted: s.isDeleted
    }));

    await this.pushTable(db.courses, 'courses', (c) => ({
      id: c.id, semester_id: c.semesterId, code: c.code, title: c.title, user_id: userId, last_modified: c.lastModified, is_deleted: c.isDeleted
    }));

    await this.pushTable(db.enrollments, 'enrollments', (e) => ({
      id: e.id, student_id: e.studentId, course_id: e.courseId, user_id: userId, last_modified: e.lastModified, is_deleted: e.isDeleted
    }));

    await this.pushTable(db.attendanceSessions, 'attendance_sessions', (s) => ({
      id: s.id, course_id: s.courseId, date: s.date, title: s.title, user_id: userId, last_modified: s.lastModified, is_deleted: s.isDeleted
    }));

    await this.pushTable(db.attendanceRecords, 'attendance_records', (r) => ({
      id: r.id, session_id: r.sessionId, student_id: r.studentId, status: r.status, marked_at: r.timestamp, user_id: userId, last_modified: r.lastModified, is_deleted: r.isDeleted
    }));
  },

  async pushTable(table: any, tableName: string, mapFn: (item: any) => any, conflictKey: string = 'id') {
    const unsynced = await table.filter((i: any) => i.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    // We push everything, including deletes (marked as is_deleted=1)
    // Server should handle 'upsert' logic
    const toSync = unsynced.map(mapFn);
    
    const { error } = await supabase.from(tableName).upsert(toSync, { onConflict: conflictKey });
    
    if (error) {
      console.error(`Sync: Error pushing ${tableName}:`, error);
    } else {
      // Mark as synced locally
      await table.bulkUpdate(unsynced.map((i: any) => ({ key: i.id!, changes: { synced: 1 } })));
    }
  },

  async pullFromCloud(userId: string) {
    await this.pullTable(db.students, 'students', userId, (s) => ({
      regNumber: s.reg_number, name: s.name, email: s.email, phone: s.phone, synced: 1, userId, lastModified: s.last_modified, isDeleted: s.is_deleted
    }), 'regNumber');

    await this.pullTable(db.semesters, 'semesters', userId, (s) => ({
      id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, isActive: s.is_active, isArchived: s.is_archived, synced: 1, userId, lastModified: s.last_modified, isDeleted: s.is_deleted
    }));

    await this.pullTable(db.courses, 'courses', userId, (c) => ({
      id: c.id, semesterId: c.semester_id, code: c.code, title: c.title, synced: 1, userId, lastModified: c.last_modified, isDeleted: c.is_deleted
    }));

    await this.pullTable(db.enrollments, 'enrollments', userId, (e) => ({
      id: e.id, studentId: e.student_id, courseId: e.course_id, synced: 1, userId, lastModified: e.last_modified, isDeleted: e.is_deleted
    }));

    await this.pullTable(db.attendanceSessions, 'attendance_sessions', userId, (s) => ({
      id: s.id, courseId: s.course_id, date: s.date, title: s.title, synced: 1, userId, lastModified: s.last_modified, isDeleted: s.is_deleted
    }));

    await this.pullTable(db.attendanceRecords, 'attendance_records', userId, (r) => ({
      id: r.id, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at, synced: 1, userId, lastModified: r.last_modified, isDeleted: r.is_deleted
    }));
  },

  async pullTable(table: any, tableName: string, userId: string, mapFn: (item: any) => any, keyField: string = 'id') {
    // Get all records from server
    const { data: serverRecords, error } = await supabase.from(tableName).select('*').eq('user_id', userId);
    if (error || !serverRecords) {
      if (error) console.error(`Sync: Error pulling ${tableName}:`, error);
      return;
    }

    await db.transaction('rw', table, async () => {
      for (const serverRecord of serverRecords) {
        const localObj = mapFn(serverRecord);
        const uniqueVal = localObj[keyField];
        
        let localRecord;
        if (keyField === 'id') {
            localRecord = await table.get(uniqueVal);
        } else {
            localRecord = await table.where(keyField).equals(uniqueVal).first();
        }

        if (!localRecord) {
          // New from server
          await table.add(localObj);
        } else {
          // Conflict Resolution: Last Write Wins
          // If local is synced=0 (unsaved changes), we technically have a conflict.
          // But here we simply check timestamps.
          const serverTime = serverRecord.last_modified || 0;
          const localTime = localRecord.lastModified || 0;

          if (serverTime > localTime) {
            // Server is newer, overwrite local
            // We use put/update to overwrite. 
            // Important: Preserve the primary key if it's auto-incremented locally but we're matching by something else?
            // For 'id' based tables, localObj has the ID.
            // For 'regNumber', we need to keep local ID.
            if (localRecord.id && !localObj.id) localObj.id = localRecord.id;
            
            await table.put(localObj);
          }
        }
      }
    });
  }
};