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
    // 1. Students
    const { data: students } = await supabase.from('students').select('*').eq('user_id', userId);
    if (students) {
      for (const s of students) {
        const exists = await db.students.where('regNumber').equals(s.reg_number).first();
        if (!exists) await db.students.add({ regNumber: s.reg_number, name: s.name, email: s.email, phone: s.phone, synced: 1, userId });
      }
    }

    // 2. Semesters
    const { data: semesters } = await supabase.from('semesters').select('*').eq('user_id', userId);
    if (semesters) {
      for (const s of semesters) {
        const exists = await db.semesters.get(s.id);
        if (!exists) await db.semesters.add({ id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, isActive: s.is_active, isArchived: s.is_archived, synced: 1, userId });
      }
    }

    // 3. Courses
    const { data: courses } = await supabase.from('courses').select('*').eq('user_id', userId);
    if (courses) {
      for (const c of courses) {
        const exists = await db.courses.get(c.id);
        if (!exists) await db.courses.add({ id: c.id, semesterId: c.semester_id, code: c.code, title: c.title, synced: 1, userId });
      }
    }

    // 4. Enrollments
    const { data: enrollments } = await supabase.from('enrollments').select('*').eq('user_id', userId);
    if (enrollments) {
      for (const e of enrollments) {
        const exists = await db.enrollments.get(e.id);
        if (!exists) await db.enrollments.add({ id: e.id, studentId: e.student_id, courseId: e.course_id, synced: 1, userId });
      }
    }

    // 5. Sessions
    const { data: sessions } = await supabase.from('attendance_sessions').select('*').eq('user_id', userId);
    if (sessions) {
      for (const s of sessions) {
        const exists = await db.attendanceSessions.get(s.id);
        if (!exists) await db.attendanceSessions.add({ id: s.id, courseId: s.course_id, date: s.date, title: s.title, synced: 1, userId });
      }
    }

    // 6. Records
    const { data: records } = await supabase.from('attendance_records').select('*').eq('user_id', userId);
    if (records) {
      for (const r of records) {
        const exists = await db.attendanceRecords.get(r.id);
        if (!exists) await db.attendanceRecords.add({ id: r.id, sessionId: r.session_id, studentId: r.student_id, status: r.status, timestamp: r.marked_at, synced: 1, userId });
      }
    }
  },

  async pushStudents(userId: string) {
    const unsynced = await db.students.filter((s: any) => s.synced !== 1).toArray();
    if (unsynced.length === 0) return;
    const toSync = unsynced.map(s => ({ reg_number: s.regNumber, name: s.name, email: s.email, phone: s.phone, user_id: userId }));
    const { error } = await supabase.from('students').upsert(toSync, { onConflict: 'reg_number' });
    if (!error) await db.students.bulkUpdate(unsynced.map(s => ({ key: s.id!, changes: { synced: 1, userId } })));
  },

  async pushSemesters(userId: string) {
    const unsynced = await db.semesters.filter((s: any) => s.synced !== 1).toArray();
    for (const sem of unsynced) {
      const { error } = await supabase.from('semesters').upsert({ id: sem.id, name: sem.name, start_date: sem.startDate, end_date: sem.endDate, is_active: sem.isActive, is_archived: sem.isArchived, user_id: userId });
      if (!error) await db.semesters.update(sem.id!, { synced: 1, userId });
    }
  },

  async pushCourses(userId: string) {
    const unsynced = await db.courses.filter((c: any) => c.synced !== 1).toArray();
    for (const c of unsynced) {
      const { error } = await supabase.from('courses').upsert({ id: c.id, semester_id: c.semesterId, code: c.code, title: c.title, user_id: userId });
      if (!error) await db.courses.update(c.id!, { synced: 1, userId });
    }
  },

  async pushEnrollments(userId: string) {
    const unsynced = await db.enrollments.filter((e: any) => e.synced !== 1).toArray();
    for (const e of unsynced) {
      const { error } = await supabase.from('enrollments').upsert({ id: e.id, student_id: e.studentId, course_id: e.courseId, user_id: userId });
      if (!error) await db.enrollments.update(e.id!, { synced: 1, userId });
    }
  },

  async pushSessions(userId: string) {
    const unsynced = await db.attendanceSessions.filter((s: any) => s.synced !== 1).toArray();
    for (const sess of unsynced) {
      const { error } = await supabase.from('attendance_sessions').upsert({ id: sess.id, course_id: sess.courseId, date: sess.date, title: sess.title, user_id: userId });
      if (!error) await db.attendanceSessions.update(sess.id!, { synced: 1, userId });
    }
  },

  async pushRecords(userId: string) {
    const unsynced = await db.attendanceRecords.filter((r: any) => r.synced !== 1).toArray();
    for (const rec of unsynced) {
      const { error } = await supabase.from('attendance_records').upsert({ id: rec.id, session_id: rec.sessionId, student_id: rec.studentId, status: rec.status, marked_at: rec.timestamp, user_id: userId });
      if (!error) await db.attendanceRecords.update(rec.id!, { synced: 1, userId });
    }
  }
};