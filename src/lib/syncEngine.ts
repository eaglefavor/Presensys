import { db, type Student } from '../db/db';
import { supabase } from './supabase';

export const syncEngine = {
  async syncAll() {
    if (!navigator.onLine) return { success: false, message: 'Offline' };

    try {
      // 1. Push Local Changes to Cloud
      await this.pushToCloud();
      
      // 2. Pull Cloud Data to Local (if needed)
      await this.pullFromCloud();

      return { success: true };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  },

  async pushToCloud() {
    await this.syncStudents();
    await this.syncSemesters();
    await this.syncCourses();
    await this.syncEnrollments();
    await this.syncSessions();
    await this.syncRecords();
  },

  async pullFromCloud() {
    // Only pull if we are online
    if (!navigator.onLine) return;

    // A. Pull Students
    const { data: students, error: sErr } = await supabase.from('students').select('*');
    if (!sErr && students) {
      await db.transaction('rw', db.students, async () => {
        for (const s of students) {
          const exists = await db.students.where('regNumber').equals(s.reg_number).first();
          if (!exists) {
            await db.students.add({
              regNumber: s.reg_number,
              name: s.name,
              email: s.email,
              phone: s.phone,
              synced: 1
            });
          }
        }
      });
    }

    // B. Pull Semesters
    const { data: semesters, error: semErr } = await supabase.from('semesters').select('*');
    if (!semErr && semesters) {
      await db.transaction('rw', db.semesters, async () => {
        for (const s of semesters) {
          const exists = await db.semesters.get(s.id);
          if (!exists) {
            await db.semesters.add({
              id: s.id,
              name: s.name,
              startDate: s.start_date,
              endDate: s.end_date,
              isActive: s.is_active,
              isArchived: s.is_archived,
              synced: 1
            });
          }
        }
      });
    }

    // C. Pull Courses
    const { data: courses, error: cErr } = await supabase.from('courses').select('*');
    if (!cErr && courses) {
      await db.transaction('rw', db.courses, async () => {
        for (const c of courses) {
          const exists = await db.courses.get(c.id);
          if (!exists) {
            await db.courses.add({
              id: c.id,
              semesterId: c.semester_id,
              code: c.code,
              title: c.title,
              synced: 1
            });
          }
        }
      });
    }

    // D. Pull Enrollments
    const { data: enrollments, error: eErr } = await supabase.from('enrollments').select('*');
    if (!eErr && enrollments) {
      await db.transaction('rw', db.enrollments, async () => {
        for (const e of enrollments) {
          const exists = await db.enrollments.get(e.id);
          if (!exists) {
            await db.enrollments.add({
              id: e.id,
              studentId: e.student_id,
              courseId: e.course_id,
              synced: 1
            });
          }
        }
      });
    }

    // E. Pull Sessions
    const { data: sessions, error: sessErr } = await supabase.from('attendance_sessions').select('*');
    if (!sessErr && sessions) {
      await db.transaction('rw', db.attendanceSessions, async () => {
        for (const s of sessions) {
          const exists = await db.attendanceSessions.get(s.id);
          if (!exists) {
            await db.attendanceSessions.add({
              id: s.id,
              courseId: s.course_id,
              date: s.date,
              title: s.title,
              synced: 1
            });
          }
        }
      });
    }

    // F. Pull Records
    const { data: records, error: rErr } = await supabase.from('attendance_records').select('*');
    if (!rErr && records) {
      await db.transaction('rw', db.attendanceRecords, async () => {
        for (const r of records) {
          const exists = await db.attendanceRecords.get(r.id);
          if (!exists) {
            await db.attendanceRecords.add({
              id: r.id,
              sessionId: r.session_id,
              studentId: r.student_id,
              status: r.status,
              timestamp: r.marked_at,
              synced: 1
            });
          }
        }
      });
    }
  },

  // --- Push Functions (Existing) ---
  async syncStudents() {
    const unsynced = await db.students.filter((s: Student) => s.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    const toSync = unsynced.map((s: Student) => ({
      reg_number: s.regNumber,
      name: s.name,
      email: s.email,
      phone: s.phone
    }));

    const { error } = await supabase.from('students').upsert(toSync, { onConflict: 'reg_number' });
    if (!error) {
      const ids = unsynced.map((s: Student) => s.id!);
      await db.students.bulkUpdate(ids.map((id: number) => ({ key: id, changes: { synced: 1 } })));
    }
  },

  async syncSemesters() {
    const unsynced = await db.semesters.filter(s => s.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    for (const sem of unsynced) {
      const { error } = await supabase.from("semesters").upsert({
        id: sem.id, // Keep ID consistent
        name: sem.name,
        start_date: sem.startDate,
        end_date: sem.endDate,
        is_active: sem.isActive,
        is_archived: sem.isArchived
      }).select();

      if (!error) await db.semesters.update(sem.id!, { synced: 1 });
    }
  },

  async syncCourses() {
    const unsynced = await db.courses.filter(c => c.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    for (const course of unsynced) {
      const { error } = await supabase.from('courses').upsert({
        id: course.id,
        semester_id: course.semesterId,
        code: course.code,
        title: course.title
      });
      if (!error) await db.courses.update(course.id!, { synced: 1 });
    }
  },

  async syncEnrollments() {
    const unsynced = await db.enrollments.filter(e => e.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    for (const enr of unsynced) {
      const { error } = await supabase.from('enrollments').upsert({
        id: enr.id,
        student_id: enr.studentId,
        course_id: enr.courseId
      });
      if (!error) await db.enrollments.update(enr.id!, { synced: 1 });
    }
  },

  async syncSessions() {
    const unsynced = await db.attendanceSessions.filter(s => s.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    for (const sess of unsynced) {
      const { error } = await supabase.from('attendance_sessions').upsert({
        id: sess.id,
        course_id: sess.courseId,
        date: sess.date,
        title: sess.title
      });
      if (!error) await db.attendanceSessions.update(sess.id!, { synced: 1 });
    }
  },

  async syncRecords() {
    const unsynced = await db.attendanceRecords.filter(r => r.synced !== 1).toArray();
    if (unsynced.length === 0) return;

    for (const rec of unsynced) {
      const { error } = await supabase.from('attendance_records').upsert({
        id: rec.id,
        session_id: rec.sessionId,
        student_id: rec.studentId,
        status: rec.status,
        marked_at: rec.timestamp
      });
      if (!error) await db.attendanceRecords.update(rec.id!, { synced: 1 });
    }
  }
};
