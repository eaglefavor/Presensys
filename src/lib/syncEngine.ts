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
      await this.garbageCollect();
      console.log('Sync: Completed');
      return { success: true };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  },

  async garbageCollect() {
    const tables = [db.students, db.semesters, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords];
    for (const table of tables) {
      const tombstones = await table.filter((r: any) => r.synced === 1 && r.isDeleted === 1).primaryKeys();
      if (tombstones.length > 0) {
        console.log(`GC: Cleaning up ${tombstones.length} tombstones from ${table.name}`);
        await table.bulkDelete(tombstones);
      }
    }
  },

  async pushToCloud(userId: string) {
    // 1. Students
    await this.pushTable(db.students, 'students', (s) => {
      const data: any = { reg_number: s.regNumber, name: s.name, email: s.email, phone: s.phone, user_id: userId, last_modified: s.lastModified, is_deleted: s.isDeleted };
      if (s.serverId) data.id = s.serverId;
      return data;
    });
    
    // 2. Semesters
    await this.pushTable(db.semesters, 'semesters', (s) => {
      const data: any = { name: s.name, start_date: s.startDate, end_date: s.endDate, is_active: s.isActive, is_archived: s.isArchived, user_id: userId, last_modified: s.lastModified, is_deleted: s.isDeleted };
      if (s.serverId) data.id = s.serverId;
      return data;
    });

    // 3. Courses
    const semesterMap = await this.getLocalToServerIdMap(db.semesters);
    await this.pushTable(db.courses, 'courses', (c) => {
      const data: any = { 
        semester_id: semesterMap.get(c.semesterId),
        code: c.code, title: c.title, user_id: userId, last_modified: c.lastModified, is_deleted: c.isDeleted 
      };
      if (c.serverId) data.id = c.serverId;
      return data;
    });

    // 4. Enrollments
    const studentMap = await this.getLocalToServerIdMap(db.students);
    const courseMap = await this.getLocalToServerIdMap(db.courses);
    await this.pushTable(db.enrollments, 'enrollments', (e) => {
      const data: any = { 
        student_id: studentMap.get(e.studentId),
        course_id: courseMap.get(e.courseId),
        user_id: userId, last_modified: e.lastModified, is_deleted: e.isDeleted 
      };
      if (e.serverId) data.id = e.serverId;
      return data;
    });

    // 5. Sessions
    await this.pushTable(db.attendanceSessions, 'attendance_sessions', (s) => {
      const data: any = { 
        course_id: courseMap.get(s.courseId),
        date: s.date, title: s.title, user_id: userId, last_modified: s.lastModified, is_deleted: s.isDeleted 
      };
      if (s.serverId) data.id = s.serverId;
      return data;
    });

    // 6. Records
    const sessionMap = await this.getLocalToServerIdMap(db.attendanceSessions);
    await this.pushTable(db.attendanceRecords, 'attendance_records', (r) => {
      const data: any = { 
        session_id: sessionMap.get(r.sessionId),
        student_id: studentMap.get(r.studentId),
        status: r.status, marked_at: r.timestamp, user_id: userId, last_modified: r.lastModified, is_deleted: r.isDeleted 
      };
      if (r.serverId) data.id = r.serverId;
      return data;
    });
  },

  async pushTable(table: any, tableName: string, mapFn: (item: any) => any) {
    const unsynced = await table.filter((i: any) => i.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    const toSync = unsynced.map(mapFn);
    
    // Filter out records where a required FK was not resolved
    const validToSync = toSync.filter((item: any) => {
       if (tableName === 'courses') return !!item.semester_id;
       if (tableName === 'enrollments') return !!item.student_id && !!item.course_id;
       if (tableName === 'attendance_sessions') return !!item.course_id;
       if (tableName === 'attendance_records') return !!item.session_id && !!item.student_id;
       return true;
    });

    if (validToSync.length === 0) return;

    const { data, error } = await supabase.from(tableName).upsert(validToSync).select();
    
    if (error) {
      console.error(`Sync: Error pushing ${tableName}:`, error);
    } else if (data) {
      await db.transaction('rw', table, async () => {
        for (const serverRecord of data) {
          const localMatch = unsynced.find((u: any) => {
            if (u.serverId === serverRecord.id) return true;
            if (serverRecord.reg_number && u.regNumber === serverRecord.reg_number) return true;
            if (u.lastModified === serverRecord.last_modified) return true;
            return false;
          });

          if (localMatch) {
            await table.update(localMatch.id!, { synced: 1, serverId: serverRecord.id });
          }
        }
      });
    }
  },

  async pullFromCloud(userId: string) {
    // 1. Students
    await this.pullTable(db.students, 'students', userId, (s) => ({
      regNumber: s.reg_number, name: s.name, email: s.email, phone: s.phone, synced: 1, userId, lastModified: s.last_modified, isDeleted: s.is_deleted, serverId: s.id
    }), 'regNumber');

    // 2. Semesters
    await this.pullTable(db.semesters, 'semesters', userId, (s) => ({
      name: s.name, startDate: s.start_date, endDate: s.end_date, isActive: s.is_active, isArchived: s.is_archived, synced: 1, userId, lastModified: s.last_modified, isDeleted: s.is_deleted, serverId: s.id
    }));

    const semesterMap = await this.getServerToLocalIdMap(db.semesters);
    const studentMap = await this.getServerToLocalIdMap(db.students);

    // 3. Courses
    await this.pullTable(db.courses, 'courses', userId, (c) => ({
      semesterId: semesterMap.get(c.semester_id),
      code: c.code, title: c.title, synced: 1, userId, lastModified: c.last_modified, isDeleted: c.is_deleted, serverId: c.id
    }));

    const courseMap = await this.getServerToLocalIdMap(db.courses);

    // 4. Enrollments
    await this.pullTable(db.enrollments, 'enrollments', userId, (e) => ({
      studentId: studentMap.get(e.student_id),
      courseId: courseMap.get(e.course_id),
      synced: 1, userId, lastModified: e.last_modified, isDeleted: e.is_deleted, serverId: e.id
    }));

    // 5. Sessions
    await this.pullTable(db.attendanceSessions, 'attendance_sessions', userId, (s) => ({
      courseId: courseMap.get(s.course_id),
      date: s.date, title: s.title, synced: 1, userId, lastModified: s.last_modified, isDeleted: s.is_deleted, serverId: s.id
    }));

    const sessionMap = await this.getServerToLocalIdMap(db.attendanceSessions);

    // 6. Records
    await this.pullTable(db.attendanceRecords, 'attendance_records', userId, (r) => ({
      sessionId: sessionMap.get(r.session_id),
      studentId: studentMap.get(r.student_id),
      status: r.status, timestamp: r.marked_at, synced: 1, userId, lastModified: r.last_modified, isDeleted: r.is_deleted, serverId: r.id
    }));
  },

  async pullTable(table: any, tableName: string, userId: string, mapFn: (item: any) => any, fallbackKey: string = '') {
    const { data: serverRecords, error } = await supabase.from(tableName).select('*').eq('user_id', userId);
    if (error || !serverRecords) {
      if (error) console.error(`Sync: Error pulling ${tableName}:`, error);
      return;
    }

    await db.transaction('rw', table, async () => {
      for (const serverRecord of serverRecords) {
        const localObj = mapFn(serverRecord);
        
        if (['courses', 'enrollments', 'attendance_sessions', 'attendance_records'].includes(tableName)) {
           if (tableName === 'courses' && !localObj.semesterId) continue;
           if (tableName === 'enrollments' && (!localObj.studentId || !localObj.courseId)) continue;
           if (tableName === 'attendance_sessions' && !localObj.courseId) continue;
           if (tableName === 'attendance_records' && (!localObj.sessionId || !localObj.studentId)) continue;
        }

        const uniqueVal = localObj.serverId;
        let localRecord = await table.where('serverId').equals(uniqueVal).first();
        
        if (!localRecord && fallbackKey) {
           const val = localObj[fallbackKey];
           if (val) localRecord = await table.where(fallbackKey).equals(val).first();
        }

        if (!localRecord) {
          await table.add(localObj);
        } else {
          const serverTime = serverRecord.last_modified || 0;
          const localTime = localRecord.lastModified || 0;

          if (serverTime > localTime) {
            localObj.id = localRecord.id;
            await table.put(localObj);
          } else if (!localRecord.serverId) {
            await table.update(localRecord.id!, { serverId: uniqueVal });
          }
        }
      }
    });
  },
  
  async getLocalToServerIdMap(table: any) {
    const records = await table.toArray();
    const map = new Map<number, number>();
    records.forEach((r: any) => { if (r.serverId) map.set(r.id!, r.serverId); });
    return map;
  },

  async getServerToLocalIdMap(table: any) {
    const records = await table.toArray();
    const map = new Map<number, number>();
    records.forEach((r: any) => { if (r.serverId) map.set(r.serverId, r.id!); });
    return map;
  }
};