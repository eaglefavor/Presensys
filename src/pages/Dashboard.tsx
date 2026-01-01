import { useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Users, BookOpen, AlertCircle, TrendingUp, ChevronRight, Plus } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const activeSemester = useAppStore(state => state.activeSemester);

  useEffect(() => {
    const testSupabase = async () => {
      const { data, error } = await supabase.from('semesters').select('*').limit(1);
      if (error) {
        console.warn('Supabase test failed:', error.message);
      } else {
        console.log('Supabase connected successfully:', data);
      }
    };
    testSupabase();
  }, []);
  
  const studentCount = useLiveQuery(() => db.students.count());
  const courseCount = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.id!).count() : 0,
    [activeSemester]
  );
  
  const attendanceStats = useLiveQuery(async () => {
    if (!activeSemester) return null;
    const courses = await db.courses.where('semesterId').equals(activeSemester.id!).toArray();
    const statsList = [];
    for (const course of courses) {
      const sessions = await db.attendanceSessions.where('courseId').equals(course.id!).toArray();
      const sessionIds = sessions.map(s => s.id!);
      const records = await db.attendanceRecords.where('sessionId').anyOf(sessionIds).toArray();
      const presentCount = records.filter(r => r.status === 'present').length;
      const totalPossible = records.length;
      const percentage = totalPossible > 0 ? (presentCount / totalPossible) * 100 : 100;
      statsList.push({ ...course, percentage, totalSessions: sessions.length });
    }
    return statsList;
  }, [activeSemester]);

  const avgAttendance = useMemo(() => {
    if (!attendanceStats || attendanceStats.length === 0) return 0;
    const sum = attendanceStats.reduce((acc, curr) => acc + curr.percentage, 0);
    return Math.round(sum / attendanceStats.length);
  }, [attendanceStats]);

  return (
    <div className="animate-in">
      <div className="mb-4">
        <h2 className="fw-bold">Welcome back!</h2>
        <p className="text-muted small">Here's the summary for {activeSemester?.name || 'the semester'}</p>
      </div>

      {/* Main Stat Card */}
      <div className="card border-0 bg-primary text-white mb-4 shadow">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="opacity-75 small text-uppercase fw-bold">Average Attendance</span>
            <TrendingUp size={20} className="opacity-75" />
          </div>
          <div className="d-flex align-items-baseline gap-2">
            <h1 className="display-4 fw-bold mb-0">{avgAttendance}%</h1>
            <span className="small opacity-75">overall</span>
          </div>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="row g-3 mb-4">
        <div className="col-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <Users size={20} className="text-primary mb-2" />
              <div className="h4 fw-bold mb-0">{studentCount || 0}</div>
              <div className="text-muted small">Students</div>
            </div>
          </div>
        </div>
        <div className="col-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <BookOpen size={20} className="text-info mb-2" />
              <div className="h4 fw-bold mb-0">{courseCount || 0}</div>
              <div className="text-muted small">Courses</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Courses Section */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-bold mb-0 text-uppercase small text-muted">My Courses</h6>
        <Link to="/courses" className="small text-decoration-none">View All</Link>
      </div>

      <div className="d-flex flex-column gap-3 mb-4">
        {attendanceStats?.slice(0, 3).map(course => (
          <Link key={course.id} to="/attendance" className="text-decoration-none">
            <div className="card border-0 shadow-sm">
              <div className="card-body d-flex align-items-center gap-3">
                <div className={`p-2 rounded-3 ${course.percentage < 75 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}`}>
                  {course.percentage < 75 ? <AlertCircle size={24} /> : <BookOpen size={24} />}
                </div>
                <div className="flex-grow-1">
                  <div className="fw-bold text-dark">{course.code}</div>
                  <div className="text-muted small text-truncate" style={{ maxWidth: '180px' }}>{course.title}</div>
                </div>
                <div className="text-end">
                  <div className={`fw-bold ${course.percentage < 75 ? 'text-danger' : 'text-success'}`}>{Math.round(course.percentage)}%</div>
                  <div className="text-muted" style={{ fontSize: '10px' }}>{course.totalSessions} sessions</div>
                </div>
                <ChevronRight size={18} className="text-muted" />
              </div>
            </div>
          </Link>
        ))}
        {(!attendanceStats || attendanceStats.length === 0) && (
          <div className="text-center py-4 bg-white rounded-4 border-dashed border-2 text-muted small">
            No courses found. Add your first course to get started.
          </div>
        )}
      </div>

      {/* Quick Action Button - Floating Style in the content */}
      <Link to="/attendance" className="btn btn-primary w-100 py-3 shadow-lg d-flex align-items-center justify-content-center gap-2">
        <Plus size={20} /> Mark New Attendance
      </Link>
    </div>
  );
}
