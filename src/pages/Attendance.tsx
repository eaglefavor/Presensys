import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, CheckCircle, XCircle, HelpCircle, ChevronRight, Calendar } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';

export default function Attendance() {
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

  const handleCreateSession = async () => {
    if (!selectedCourseId) return;
    const id = await db.attendanceSessions.add({
      courseId: selectedCourseId,
      date: new Date().toISOString().split('T')[0],
      title: `Session ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    });
    setActiveSessionId(id as number);
  };

  const updateRecord = async (studentId: number, status: 'present' | 'absent' | 'excused') => {
    if (!activeSessionId) return;
    const existing = await db.attendanceRecords.where('[sessionId+studentId]').equals([activeSessionId, studentId]).first();
    if (existing) {
      await db.attendanceRecords.update(existing.id!, { status, timestamp: Date.now() });
    } else {
      await db.attendanceRecords.add({ sessionId: activeSessionId, studentId, status, timestamp: Date.now() });
    }
    // Haptic feedback if supported
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  };

  if (!activeSemester) return (
    <div className="text-center py-5">
      <Calendar size={48} className="text-muted mb-3 opacity-25" />
      <h5>No active semester</h5>
      <p className="text-muted small px-4">Please set an active semester in the Semesters tab first.</p>
    </div>
  );

  // View 1: Select Course
  if (!selectedCourseId) {
    return (
      <div className="animate-in">
        <h4 className="fw-bold mb-4">Select a Course</h4>
        <div className="d-flex flex-column gap-2">
          {courses?.map(course => (
            <div 
              key={course.id}
              className="card border-0 shadow-sm"
              onClick={() => setSelectedCourseId(course.id!)}
              style={{ cursor: 'pointer' }}
            >
              <div className="card-body d-flex justify-content-between align-items-center py-3">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-primary text-white rounded-3 px-2 py-1 small fw-bold">{course.code}</div>
                  <div className="fw-bold text-dark">{course.title}</div>
                </div>
                <ChevronRight size={18} className="text-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // View 2: Sessions List
  if (!activeSessionId) {
    const selectedCourse = courses?.find(c => c.id === selectedCourseId);
    return (
      <div className="animate-in">
        <div className="d-flex align-items-center gap-2 mb-4">
          <button className="btn btn-light btn-sm rounded-circle p-2" onClick={() => setSelectedCourseId(null)}>
            <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <h4 className="mb-0 fw-bold">{selectedCourse?.code}</h4>
        </div>

        <button className="btn btn-primary w-100 py-3 mb-4 d-flex align-items-center justify-content-center gap-2 shadow rounded-4" onClick={handleCreateSession}>
          <Plus size={20} /> Start New Session
        </button>

        <h6 className="text-muted small text-uppercase fw-bold mb-3">Previous Sessions</h6>
        <div className="d-flex flex-column gap-2">
          {sessions?.map(session => (
            <div 
              key={session.id}
              className="card border-0 shadow-sm"
              onClick={() => setActiveSessionId(session.id!)}
              style={{ cursor: 'pointer' }}
            >
              <div className="card-body d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-light p-2 rounded-3 text-primary"><Calendar size={20} /></div>
                  <div>
                    <div className="fw-bold">{session.title}</div>
                    <div className="small text-muted">{session.date}</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // View 3: Marking Mode
  const currentSession = sessions?.find(s => s.id === activeSessionId);
  const stats = {
    present: records?.filter(r => r.status === 'present').length || 0,
    absent: records?.filter(r => r.status === 'absent').length || 0,
    total: enrollments?.length || 0
  };

  return (
    <div className="animate-in">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-light btn-sm rounded-circle p-2" onClick={() => setActiveSessionId(null)}>
            <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div>
            <h5 className="mb-0 fw-bold text-truncate" style={{ maxWidth: '150px' }}>{currentSession?.title}</h5>
            <div className="small text-muted">{stats.total} students</div>
          </div>
        </div>
        <div className="d-flex gap-2">
          <div className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3">{stats.present} P</div>
          <div className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-3">{stats.absent} A</div>
        </div>
      </div>

      <div className="d-flex flex-column gap-2">
        {enrollments?.map(student => {
          const record = records?.find(r => r.studentId === student.id);
          const status = record?.status;
          
          return (
            <div key={student.id} className="card border-0 shadow-sm overflow-hidden">
              <div className="card-body p-3 d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden me-2">
                  <div className="fw-bold text-truncate" style={{ fontSize: '14px' }}>{student.name}</div>
                  <div className="text-muted font-monospace" style={{ fontSize: '11px' }}>{student.regNumber}</div>
                </div>
                
                <div className="d-flex gap-2">
                  <button 
                    className={`btn btn-sm ${status === 'present' ? 'btn-success shadow-sm' : 'btn-outline-success border-0 bg-light'}`}
                    onClick={() => updateRecord(student.id!, 'present')}
                    style={{ width: '42px', height: '42px', padding: 0 }}
                  >
                    <CheckCircle size={22} />
                  </button>
                  <button 
                    className={`btn btn-sm ${status === 'absent' ? 'btn-danger shadow-sm' : 'btn-outline-danger border-0 bg-light'}`}
                    onClick={() => updateRecord(student.id!, 'absent')}
                    style={{ width: '42px', height: '42px', padding: 0 }}
                  >
                    <XCircle size={22} />
                  </button>
                  <button 
                    className={`btn btn-sm ${status === 'excused' ? 'btn-warning shadow-sm' : 'btn-outline-warning border-0 bg-light text-dark'}`}
                    onClick={() => updateRecord(student.id!, 'excused')}
                    style={{ width: '42px', height: '42px', padding: 0 }}
                  >
                    <HelpCircle size={22} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
