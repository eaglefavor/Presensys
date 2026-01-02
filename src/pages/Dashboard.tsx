import { useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, AlertCircle, TrendingUp, ChevronRight, Plus, CheckCircle2 } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const activeSemester = useAppStore(state => state.activeSemester);

  useEffect(() => {
    const testSupabase = async () => {
      const { data, error } = await supabase.from('semesters').select('*').limit(1);
      if (!error) console.log('Supabase connected:', data);
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
    <div className="dashboard-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Simplistic Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h1 className="h4 fw-black mb-0 text-primary" style={{ color: 'var(--primary-blue)' }}>DASHBOARD</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">{activeSemester?.name || 'Academic Overview'}</p>
          </div>
          <Link to="/attendance" className="btn btn-primary rounded-circle p-3 shadow-lg d-flex align-items-center justify-content-center" style={{ width: '52px', height: '52px' }}>
            <Plus size={24} />
          </Link>
        </div>
      </div>

      <div className="px-4 container-mobile">
        {/* Main Stats Feed */}
        <div className="row g-3 mb-4">
          <div className="col-12">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card border-0 bg-white p-4 shadow-sm position-relative overflow-hidden">
              <div className="position-absolute top-0 end-0 p-4 opacity-5">
                <TrendingUp size={100} />
              </div>
              <div className="position-relative z-10">
                <div className="xx-small fw-black text-muted text-uppercase tracking-widest mb-1">Average Attendance</div>
                <div className="d-flex align-items-baseline gap-2">
                  <h1 className="display-5 fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>{avgAttendance}%</h1>
                  <span className="badge bg-success-subtle text-success xx-small fw-bold">HEALTHY</span>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="col-6">
            <div className="card border-0 bg-white p-3 shadow-sm">
              <div className="xx-small fw-bold text-muted text-uppercase mb-1">Students</div>
              <div className="h4 fw-black mb-0 text-dark">{studentCount || 0}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="card border-0 bg-white p-3 shadow-sm">
              <div className="xx-small fw-bold text-muted text-uppercase mb-1">Courses</div>
              <div className="h4 fw-black mb-0 text-dark">{courseCount || 0}</div>
            </div>
          </div>
        </div>

        {/* Course List Section (Feed Style) */}
        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 px-1">Active Performance</h6>
        <div className="d-flex flex-column gap-2 mb-4">
          {attendanceStats?.map(course => (
            <Link key={course.id} to="/attendance" className="text-decoration-none">
              <div className="card border-0 bg-white shadow-sm overflow-hidden">
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className={`icon-box-small rounded-2 d-flex align-items-center justify-content-center ${course.percentage < 75 ? 'bg-danger bg-opacity-10 text-danger' : 'bg-primary bg-opacity-10 text-primary'}`} style={{ width: '44px', height: '44px' }}>
                    {course.percentage < 75 ? <AlertCircle size={20} /> : <BookOpen size={20} />}
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-0 text-dark text-truncate">{course.code}</h6>
                    <div className="xx-small fw-bold text-muted">{course.totalSessions} Sessions Marked</div>
                  </div>
                  <div className="text-end">
                    <div className={`fw-black ${course.percentage < 75 ? 'text-danger' : 'text-primary'}`}>{Math.round(course.percentage)}%</div>
                    <div className="xx-small fw-bold text-muted uppercase">{course.percentage < 75 ? 'Warning' : 'Good'}</div>
                  </div>
                  <ChevronRight size={16} className="text-muted opacity-50" />
                </div>
                <div className="progress rounded-0" style={{ height: '3px' }}>
                  <div className={`progress-bar ${course.percentage < 75 ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${course.percentage}%` }}></div>
                </div>
              </div>
            </Link>
          ))}
          {(!attendanceStats || attendanceStats.length === 0) && (
            <div className="text-center py-5 bg-white rounded-4 border-dashed">
              <p className="xx-small fw-bold text-muted uppercase mb-0">No course data available yet</p>
            </div>
          )}
        </div>

        {/* Quick Actions Feed */}
        <div className="card border-0 bg-primary text-white p-4 shadow-lg rounded-4 overflow-hidden position-relative">
          <div className="position-absolute top-0 end-0 p-3 opacity-10"><CheckCircle2 size={80} /></div>
          <h5 className="fw-black mb-2 letter-spacing-n1">READY TO MARK?</h5>
          <p className="xx-small fw-bold text-uppercase tracking-wider opacity-75 mb-4">Start your next session instantly</p>
          <Link to="/attendance" className="btn btn-light w-100 py-3 rounded-3 fw-black text-primary letter-spacing-n1 shadow-sm">
            LAUNCH ATTENDANCE
          </Link>
        </div>
      </div>

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
        .dashboard-page { background-color: var(--bg-gray); }
      `}</style>
    </div>
  );
}