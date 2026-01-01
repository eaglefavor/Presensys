import { db, type Student } from '../db/db';
import { supabase } from './supabase';

export const syncEngine = {
  async syncAll() {
    if (!navigator.onLine) return { success: false, message: 'Offline' };

    try {
      await this.syncStudents();
      await this.syncSemesters();
      await this.syncCourses();
      await this.syncEnrollments();
      await this.syncSessions();
      await this.syncRecords();
      return { success: true };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  },

  async syncStudents() {
    // Correct way to find unsynced using filter or where
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
      const { error } = await supabase.from('semesters').upsert({
        id: sem.id,
        name: sem.name,
        start_date: sem.startDate,
        end_date: sem.endDate,
        is_active: sem.isActive,
        is_archived: sem.isArchived
      });

      if (!error) {
        await db.semesters.update(sem.id!, { synced: 1 });
      }
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