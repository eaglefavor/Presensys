import { db } from '../db/db';
import { supabase } from './supabase';

export const syncEngine = {
  async syncAll() {
    if (!navigator.onLine) return { success: false, message: 'Offline' };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, message: 'No User' };

    try {
      await this.pushToCloud(user.id);
      await this.pullFromCloud(user.id);
      return { success: true };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  },

  async pushToCloud(userId: string) {
    await this.pushStudents(userId);
    await this.pushSemesters(userId);
    await this.pushCourses(userId);
    await this.pushEnrollments(userId);
    await this.pushSessions(userId);
    await this.pushRecords(userId);
  },

  async pullFromCloud(userId: string) {
    if (!navigator.onLine) {
        console.log('Sync: Offline, skipping pull.');
        return;
    }
    console.log('Sync: Starting Pull for User:', userId);

    // 1. Students
    const { data: students, error: sErr } = await supabase.from('students').select('*').eq('user_id', userId);
    if (sErr) console.error('Sync: Error pulling students:', sErr);
    else console.log(`Sync: Pulled ${students?.length || 0} students from cloud.`);

    if (students) {
      await db.transaction('rw', db.students, async () => {
        for (const s of students) {
          const local = await db.students.where('regNumber').equals(s.reg_number).first();
          if (local && local.isDeleted === 1) continue; // Skip if deleted locally
          
          if (!local) {
             console.log('Sync: Hydrating student:', s.name);
             await db.students.add({ regNumber: s.reg_number, name: s.name, email: s.email, phone: s.phone, synced: 1, userId });
          }
        }
      });
    }

    // 2. Semesters
    const { data: semesters } = await supabase.from('semesters').select('*').eq('user_id', userId);
    if (semesters) {
      for (const s of semesters) {
        const local = await db.semesters.get(s.id);
        if (local && local.isDeleted === 1) continue;
        if (!local) await db.semesters.add({ id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, isActive: s.is_active, isArchived: s.is_archived, synced: 1, userId });
      }
    }

    // 3. Courses
    const { data: courses } = await supabase.from('courses').select('*').eq('user_id', userId);
    if (courses) {
      for (const c of courses) {
        const local = await db.courses.get(c.id);
        if (local && local.isDeleted === 1) continue;
        if (!local) await db.courses.add({ id: c.id, semesterId: c.semester_id, code: c.code, title: c.title, synced: 1, userId });
      }
    }

    // 4. Enrollments
    const { data: enrollments } = await supabase.from('enrollments').select('*').eq('user_id', userId);
    if (enrollments) {
      for (const e of enrollments) {
        const local = await db.enrollments.get(e.id);
        if (local && local.isDeleted === 1) continue;
        if (!local) await db.enrollments.add({ id: e.id, studentId: e.student_id, courseId: e.course_id, synced: 1, userId });
      }
    }

    // 5. Sessions
    const { data: sessions } = await supabase.from('attendance_sessions').select('*').eq('user_id', userId);
    if (sessions) {
      for (const s of sessions) {
        const local = await db.attendanceSessions.get(s.id);
        if (local && local.isDeleted === 1) continue;
        if (!local) await db.attendanceSessions.add({ id: s.id, courseId: s.course_id, date: s.date, title: s.title, synced: 1, userId });
      }
    }

    // 6. Records
    const { data: records } = await supabase.from('attendance_records').select('*').eq('user_id', userId);
    if (records) {
      for (const r of records) {
        const local = await db.attendanceRecords.get(r.id);
        if (local && local.isDeleted === 1) continue;
        if (!local) await db.attendanceRecords.add({ id: r.id, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at, synced: 1, userId });
      }
    }
  },

  async pushStudents(userId: string) {
    const unsynced = await db.students.filter((s: any) => s.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    const toDelete = unsynced.filter(s => s.isDeleted === 1);
    const toUpsert = unsynced.filter(s => s.isDeleted !== 1);

    // Handle Deletions
    for (const s of toDelete) {
      const { error } = await supabase.from('students').delete().eq('reg_number', s.regNumber);
      if (!error) {
        await db.students.delete(s.id!);
      } else {
        console.error('Sync: Error deleting student:', error);
      }
    }

    // Handle Upserts
    if (toUpsert.length > 0) {
        const toSync = toUpsert.map(s => ({ reg_number: s.regNumber, name: s.name, email: s.email, phone: s.phone, user_id: userId }));
        const { error } = await supabase.from('students').upsert(toSync, { onConflict: 'reg_number' });
        if (!error) await db.students.bulkUpdate(toUpsert.map(s => ({ key: s.id!, changes: { synced: 1, userId } })));
    }
  },

  async pushSemesters(userId: string) {
    const unsynced = await db.semesters.filter((s: any) => s.synced !== 1).toArray();
    for (const sem of unsynced) {
      if (sem.isDeleted === 1) {
         const { error } = await supabase.from('semesters').delete().eq('id', sem.id).eq('user_id', userId);
         if (!error) await db.semesters.delete(sem.id!);
      } else {
         const { error } = await supabase.from('semesters').upsert({ id: sem.id, name: sem.name, start_date: sem.startDate, end_date: sem.endDate, is_active: sem.isActive, is_archived: sem.isArchived, user_id: userId });
         if (!error) await db.semesters.update(sem.id!, { synced: 1, userId });
      }
    }
  },

  async pushCourses(userId: string) {
    const unsynced = await db.courses.filter((c: any) => c.synced !== 1).toArray();
    for (const c of unsynced) {
      if (c.isDeleted === 1) {
        const { error } = await supabase.from('courses').delete().eq('id', c.id).eq('user_id', userId);
        if (!error) await db.courses.delete(c.id!);
      } else {
        const { error } = await supabase.from('courses').upsert({ id: c.id, semester_id: c.semesterId, code: c.code, title: c.title, user_id: userId });
        if (!error) await db.courses.update(c.id!, { synced: 1, userId });
      }
    }
  },

  async pushEnrollments(userId: string) {
    const unsynced = await db.enrollments.filter((e: any) => e.synced !== 1).toArray();
    for (const e of unsynced) {
      if (e.isDeleted === 1) {
        const { error } = await supabase.from('enrollments').delete().eq('id', e.id).eq('user_id', userId);
        if (!error) await db.enrollments.delete(e.id!);
      } else {
        const { error } = await supabase.from('enrollments').upsert({ id: e.id, student_id: e.studentId, course_id: e.courseId, user_id: userId });
        if (!error) await db.enrollments.update(e.id!, { synced: 1, userId });
      }
    }
  },

  async pushSessions(userId: string) {
    const unsynced = await db.attendanceSessions.filter((s: any) => s.synced !== 1).toArray();
    for (const sess of unsynced) {
      if (sess.isDeleted === 1) {
        const { error } = await supabase.from('attendance_sessions').delete().eq('id', sess.id).eq('user_id', userId);
        if (!error) await db.attendanceSessions.delete(sess.id!);
      } else {
        const { error } = await supabase.from('attendance_sessions').upsert({ id: sess.id, course_id: sess.courseId, date: sess.date, title: sess.title, user_id: userId });
        if (!error) await db.attendanceSessions.update(sess.id!, { synced: 1, userId });
      }
    }
  },

  async pushRecords(userId: string) {
    const unsynced = await db.attendanceRecords.filter((r: any) => r.synced !== 1).toArray();
    for (const rec of unsynced) {
      if (rec.isDeleted === 1) {
        const { error } = await supabase.from('attendance_records').delete().eq('id', rec.id).eq('user_id', userId);
        if (!error) await db.attendanceRecords.delete(rec.id!);
      } else {
        const { error } = await supabase.from('attendance_records').upsert({ id: rec.id, session_id: rec.sessionId, student_id: rec.studentId, status: rec.status, marked_at: rec.timestamp, user_id: userId });
        if (!error) await db.attendanceRecords.update(rec.id!, { synced: 1, userId });
      }
    }
  }
};