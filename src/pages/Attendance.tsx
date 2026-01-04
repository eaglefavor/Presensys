import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, CheckCircle, XCircle, HelpCircle, ChevronRight, Calendar, Clock, ArrowLeft, Book } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function Attendance() {
  const { user } = useAuthStore();
  const activeSemester = useAppStore(state => state.activeSemester);
  const courses = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.id!).toArray() : [],
    [activeSemester]
  );
  
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  const sessions = useLiveQuery(
    () => selectedCourseId ? db.attendanceSessions.where('courseId').equals(selectedCourseId).reverse().toArray() : [],
    [selectedCourseId]
  );

  const enrollments = useLiveQuery(
    async () => {
      if (!selectedCourseId) return [];
      const enrollmentList = await db.enrollments.where('courseId').equals(selectedCourseId).toArray();
      const studentIds = enrollmentList.map(e => e.studentId);
      return db.students.where('id').anyOf(studentIds).toArray();
    },
    [selectedCourseId]
  );

  const records = useLiveQuery(
    () => activeSessionId ? db.attendanceRecords.where('sessionId').equals(activeSessionId).toArray() : [],
    [activeSessionId]
  );

  // Pagination for courses
  const [coursePage, setCoursePage] = useState(1);
  const itemsPerPage = 5;
  const totalCoursePages = Math.ceil((courses?.length || 0) / itemsPerPage);
  const displayedCourses = courses?.slice((coursePage - 1) * itemsPerPage, coursePage * itemsPerPage);

  const handleCreateSession = async () => {
    if (!selectedCourseId || !user) return;
    const id = await db.attendanceSessions.add({
      courseId: selectedCourseId,
      date: new Date().toISOString().split('T')[0],
      title: `Session ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      userId: user.id,
      synced: 0
    });
    setActiveSessionId(id as number);
  };

  const updateRecord = async (studentId: number, status: 'present' | 'absent' | 'excused') => {
    if (!activeSessionId || !user) return;
    const existing = await db.attendanceRecords.where('[sessionId+studentId]').equals([activeSessionId, studentId]).first();
    if (existing) await db.attendanceRecords.update(existing.id!, { status, timestamp: Date.now(), synced: 0 });
    else await db.attendanceRecords.add({ sessionId: activeSessionId, studentId, status, timestamp: Date.now(), synced: 0, userId: user.id });
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  };

  if (!activeSemester) return (
    <div className="text-center py-5 mt-5 px-4 animate-in">
      <div className="bg-white d-inline-block p-4 rounded-circle mb-4 shadow-sm"><Calendar size={48} className="text-muted opacity-25" /></div>
      <h4 className="fw-black text-dark letter-spacing-n1">NO ACTIVE SESSION</h4>
      <p className="xx-small fw-bold text-muted uppercase tracking-widest">Please set an active semester first</p>
    </div>
  );

  // View 1: Select Course
  if (!selectedCourseId) {
    return (
      <div className="attendance-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
        <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
          <h1 className="h4 fw-black mb-0 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>MARK ATTENDANCE</h1>
          <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Select a course to begin</p>
        </div>
        <div className="px-4 container-mobile d-flex flex-column gap-2">
          <AnimatePresence mode="popLayout">
            {displayedCourses?.map(course => (
              <motion.div key={course.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="card border-0 bg-white shadow-sm p-3 d-flex flex-row align-items-center gap-3 cursor-pointer rounded-4 transition-all active-scale" onClick={() => setSelectedCourseId(course.id!)}>
                  <div className="bg-primary bg-opacity-10 text-primary p-2 rounded-2 shadow-inner"><Book size={24} /></div>
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-black mb-0 text-dark text-uppercase letter-spacing-n1">{course.code}</h6>
                    <p className="xx-small fw-bold text-muted mb-0 text-uppercase truncate">{course.title}</p>
                  </div>
                  <ChevronRight size={18} className="text-muted opacity-50" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {courses && courses.length > itemsPerPage && (
            <div className="d-flex justify-content-between align-items-center mt-4">
              <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={coursePage === 1} onClick={() => setCoursePage(p => Math.max(p - 1, 1))}>PREV</button>
              <span className="xx-small fw-black text-muted uppercase">Page {coursePage} of {totalCoursePages}</span>
              <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={coursePage === totalCoursePages} onClick={() => setCoursePage(p => Math.min(p + 1, totalCoursePages))}>NEXT</button>
            </div>
          )}

          {courses?.length === 0 && (
            <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
              <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No courses available</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // View 2: Sessions List
  if (!activeSessionId) {
    const selectedCourse = courses?.find(c => c.id === selectedCourseId);
    return (
      <div className="attendance-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
        <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
          <div className="d-flex align-items-center gap-3 mb-4">
            <button className="btn btn-light rounded-circle p-2 shadow-sm" onClick={() => setSelectedCourseId(null)}><ArrowLeft size={20} /></button>
            <div>
              <h1 className="h5 fw-black mb-0 text-dark text-uppercase letter-spacing-n1">{selectedCourse?.code}</h1>
              <p className="xx-small fw-bold text-muted mb-0 text-uppercase tracking-widest">Attendance Feed</p>
            </div>
          </div>
          <button className="btn btn-primary w-100 py-3 rounded-pill fw-black shadow-lg d-flex align-items-center justify-content-center gap-2 text-uppercase letter-spacing-n1" onClick={handleCreateSession}>
            <Plus size={20} /> START NEW SESSION
          </button>
        </div>
        <div className="px-4 container-mobile">
          <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 ps-1">Recent Sessions</h6>
          <div className="d-flex flex-column gap-2">
            {sessions?.map(session => (
              <div key={session.id} className="card border-0 bg-white shadow-sm p-3 d-flex flex-row align-items-center gap-3 cursor-pointer rounded-4 transition-all active-scale" onClick={() => setActiveSessionId(session.id!)}>
                <div className="bg-light text-primary p-2 rounded-2"><Calendar size={20} /></div>
                <div className="flex-grow-1">
                  <h6 className="fw-bold mb-0 text-dark text-uppercase small">{session.title}</h6>
                  <div className="xx-small fw-bold text-muted text-uppercase d-flex align-items-center gap-1 mt-1"><Clock size={10} /> {new Date(session.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
                </div>
                <ChevronRight size={16} className="text-muted opacity-50" />
              </div>
            ))}
            {sessions?.length === 0 && (
              <div className="text-center py-5 bg-white rounded-4 border-dashed">
                <p className="xx-small fw-bold text-muted uppercase">No sessions found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // View 3: Marking Mode
  const currentSession = sessions?.find(s => s.id === activeSessionId);
  const stats = {
    present: records?.filter(r => r.status === 'present').length || 0,
    total: enrollments?.length || 0
  };

  return (
    <div className="attendance-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm sticky-top" style={{ zIndex: 100 }}>
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div className="d-flex align-items-center gap-3 overflow-hidden">
            <button className="btn btn-light rounded-circle p-2 shadow-sm flex-shrink-0" onClick={() => setActiveSessionId(null)}><ArrowLeft size={20} /></button>
            <div className="overflow-hidden">
              <h1 className="h6 fw-black mb-0 text-dark text-uppercase letter-spacing-n1 truncate">{currentSession?.title}</h1>
              <p className="xx-small fw-black text-muted mb-0 uppercase tracking-widest">{stats.present} / {stats.total} ENROLLED</p>
            </div>
          </div>
          <div className="bg-primary text-white rounded-pill px-3 py-1 fw-black xx-small shadow-sm">{Math.round((stats.present/stats.total)*100 || 0)}%</div>
        </div>
        <div className="progress rounded-pill bg-light" style={{ height: '6px' }}>
          <div className="progress-bar bg-primary shadow-sm" style={{ width: `${(stats.present/stats.total)*100}%`, transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
        </div>
      </div>

      <div className="px-4 container-mobile d-flex flex-column gap-2">
        <AnimatePresence mode="popLayout">
          {enrollments?.map(student => {
            const record = records?.find(r => r.studentId === student.id);
            const status = record?.status;
            return (
              <motion.div key={student.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card border-0 bg-white shadow-sm overflow-hidden rounded-4">
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-0 text-dark text-truncate text-uppercase small letter-spacing-n1">{student.name}</h6>
                    <div className="xx-small fw-black text-muted font-monospace tracking-widest">{student.regNumber}</div>
                  </div>
                  <div className="d-flex gap-1 bg-light p-1 rounded-3">
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'present' ? 'bg-success text-white shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.id!, 'present')}><CheckCircle size={20} /></button>
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'absent' ? 'bg-danger text-white shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.id!, 'absent')}><XCircle size={20} /></button>
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'excused' ? 'bg-warning text-dark shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.id!, 'excused')}><HelpCircle size={20} /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {enrollments?.length === 0 && (
          <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
            <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No students enrolled in this course</p>
          </div>
        )}
      </div>

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1.2px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
        .active-scale:active { transform: scale(0.98); }
        .scale-110 { transform: scale(1.1); }
        .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}
