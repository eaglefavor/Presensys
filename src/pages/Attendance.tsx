import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus, Calendar, UserCheck, UserX, Search,
  CheckCircle, XCircle, HelpCircle,
  RotateCcw, Settings2, Book, ChevronRight, ArrowLeft, Clock, Download, Share2, FileText, FileSpreadsheet, Pencil, Check, Trash2
} from 'lucide-react';
import { db, type LocalAttendanceRecord } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToCSV, exportToXLSX, exportToPDF, exportToText, downloadText, shareData } from '../lib/ExportUtils';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';
import AIOptionScreen from './attendance/AIOptionScreen';
import AICameraScreen from './attendance/AICameraScreen';
import AIReconciliationScreen from './attendance/AIReconciliationScreen';

export default function Attendance() {
  const { user } = useAuthStore();
  const activeSemester = useAppStore(state => state.activeSemester);
  const courses = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.serverId).filter(c => c.isDeleted !== 1).toArray() : [],
    [activeSemester]
  );
  
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [markSearch, setMarkSearch] = useState('');
  const [debouncedMarkSearch, setDebouncedMarkSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMarkSearch(markSearch), 300);
    return () => clearTimeout(timer);
  }, [markSearch]);

  const sessions = useLiveQuery(
    () => selectedCourseId ? db.attendanceSessions.where('courseId').equals(selectedCourseId).filter(s => s.isDeleted !== 1).reverse().toArray() : [],
    [selectedCourseId]
  );

  const enrollments = useLiveQuery(
    async () => {
      if (!selectedCourseId) return [];
      try {
        const enrollmentList = await db.enrollments.where('courseId').equals(selectedCourseId).toArray();
        const activeEnrollments = enrollmentList.filter(e => e.isDeleted !== 1);
        const studentIds = activeEnrollments.map(e => e.studentId);
        return await db.students.where('serverId').anyOf(studentIds).toArray();
      } catch (err) {
        console.error("Enrollment fetch error:", err);
        toast.error("Failed to load students.");
        return [];
      }
    },
    [selectedCourseId]
  );

  const records = useLiveQuery(
    () => activeSessionId ? db.attendanceRecords.where('sessionId').equals(activeSessionId).filter(r => r.isDeleted !== 1).toArray() : [],
    [activeSessionId]
  );

  // Filtered List for Marking
  const filteredEnrollments = useMemo(() => {
    if (!enrollments) return [];
    return enrollments.filter(s => 
      s.name.toLowerCase().includes(debouncedMarkSearch.toLowerCase()) || 
      s.regNumber.includes(debouncedMarkSearch)
    );
  }, [enrollments, debouncedMarkSearch]);

  useEffect(() => {
    setStudentPage(1);
  }, [debouncedMarkSearch]);

  // View 1 & 2 logic
  const [coursePage, setCoursePage] = useState(1);
  const [studentPage, setStudentPage] = useState(1);
  const itemsPerPage = 5;
  const totalCoursePages = Math.ceil((courses?.length || 0) / itemsPerPage);
  const displayedCourses = courses?.slice((coursePage - 1) * itemsPerPage, coursePage * itemsPerPage);

  const itemsPerStudentPage = 7;
  const totalStudentPages = Math.max(1, Math.ceil((filteredEnrollments?.length || 0) / itemsPerStudentPage));
  const displayedEnrollments = filteredEnrollments?.slice((studentPage - 1) * itemsPerStudentPage, studentPage * itemsPerStudentPage);

  // Session rename state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Confirm dialog state
  const [confirmBulkMarkStatus, setConfirmBulkMarkStatus] = useState<'present' | 'absent' | null>(null);
  const [confirmResetRecords, setConfirmResetRecords] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, 'present' | 'absent' | 'excused' | 'reset'>>({});
  const [attendanceMode, setAttendanceMode] = useState<'choosing' | 'manual' | 'ai-camera' | 'ai-reconciling' | null>(null);
  const [aiImages, setAiImages] = useState<string[]>([]);

  const handleCreateSession = async () => {
    if (!selectedCourseId || !user) return;
    const newSession = {
      serverId: '',
      courseId: selectedCourseId,
      date: new Date().toISOString().split('T')[0],
      title: `Session ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      userId: user.id,
      synced: 0,
      isDeleted: 0
    };
    const id = await db.attendanceSessions.add(newSession);
    const added = await db.attendanceSessions.get(id as number);
    if (added) { setActiveSessionId(added.serverId); setAttendanceMode('choosing'); }
  };

  const updateRecord = async (studentId: string, status: 'present' | 'absent' | 'excused') => {
    if (!activeSessionId || !user) return;
    setPendingChanges(prev => ({ ...prev, [studentId]: status }));
    if (window.navigator.vibrate) window.navigator.vibrate(5);
  };

  const handleBulkMark = (status: 'present' | 'absent') => {
    if (!activeSessionId || !user || !filteredEnrollments.length) return;
    setConfirmBulkMarkStatus(status);
  };

  const doBulkMark = async (status: 'present' | 'absent') => {
    if (!activeSessionId || !user || !filteredEnrollments.length) return;
    const newPending = { ...pendingChanges };
    filteredEnrollments.forEach((s) => {
      newPending[s.serverId] = status;
    });
    setPendingChanges(newPending);
  };

  const handleResetRecords = () => {
    if (!activeSessionId || !filteredEnrollments.length) return;
    setConfirmResetRecords(true);
  };

  const doResetRecords = async () => {
    if (!activeSessionId) return;
    const newPending = { ...pendingChanges };
    filteredEnrollments.forEach((s) => {
      newPending[s.serverId] = 'reset';
    });
    setPendingChanges(newPending);
  };


  const handleSaveAttendance = async () => {
    if (!activeSessionId || !user) return;
    if (Object.keys(pendingChanges).length === 0) return;

    const now = Date.now();
    await db.transaction('rw', db.attendanceRecords, async () => {
      const existing = await db.attendanceRecords.where('sessionId').equals(activeSessionId).toArray();
      const existingMap = new Map(existing.map(r => [r.studentId, r]));

      const toUpdate: { key: number, changes: Record<string, unknown> }[] = [];
      const toAdd: Omit<LocalAttendanceRecord, 'id'>[] = [];

      for (const [studentId, status] of Object.entries(pendingChanges)) {
        const existingRecord = existingMap.get(studentId);
        if (status === 'reset') {
          if (existingRecord && existingRecord.isDeleted !== 1) {
            toUpdate.push({ key: existingRecord.id!, changes: { isDeleted: 1, synced: 0, timestamp: now } });
          }
        } else {
          if (existingRecord) {
            if (existingRecord.status !== status || existingRecord.isDeleted === 1) {
              toUpdate.push({ key: existingRecord.id!, changes: { status, isDeleted: 0, synced: 0, timestamp: now } });
            }
          } else {
            toAdd.push({
              serverId: '',
              sessionId: activeSessionId,
              studentId,
              status,
              timestamp: now,
              synced: 0,
              userId: user.id,
              isDeleted: 0
            });
          }
        }
      }

      if (toUpdate.length > 0) await db.attendanceRecords.bulkUpdate(toUpdate);
      if (toAdd.length > 0) await db.attendanceRecords.bulkAdd(toAdd);
    });

    setPendingChanges({});
  };


  const handleDeleteSession = async (sessionId: string) => {
    try {
      const session = await db.attendanceSessions.where('serverId').equals(sessionId).first();
      if (session && session.id) {
        await db.attendanceSessions.update(session.id, { isDeleted: 1, synced: 0 });

        // Also soft-delete associated records
        const records = await db.attendanceRecords.where('sessionId').equals(sessionId).toArray();
        if (records.length > 0) {
          const updates = records.map(r => ({ ...r, isDeleted: 1, synced: 0 }));
          await db.attendanceRecords.bulkPut(updates);
        }

        toast.success("Session deleted successfully.");
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setAttendanceMode(null);
        }
      }
    } catch (err) {
      console.error("Session delete error:", err);
      toast.error("Failed to delete session.");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleRenameSession = async () => {
    if (!renamingSessionId || !renameValue.trim()) { setRenamingSessionId(null); return; }
    try {
      const session = await db.attendanceSessions.where('serverId').equals(renamingSessionId).first();
    if (session) await db.attendanceSessions.update(session.id!, { title: renameValue.trim() });
    } catch (err) {
      console.error("Session rename error:", err);
      toast.error("Failed to rename session.");
    } finally {
      setRenamingSessionId(null);
      setRenameValue('');
    }
  };

  const handleSessionSelect = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setPendingChanges({});
    setAttendanceMode('choosing');
  };

  const handleCancelSession = () => {
    setActiveSessionId(null);
    setPendingChanges({});
    setAttendanceMode(null);
  };

  const handleSessionExport = (format: 'csv' | 'xlsx' | 'pdf' | 'text' | 'share') => {
    if (!enrollments || !activeSessionId || !currentSession) return;
    const selectedCourse = courses?.find(c => c.serverId === selectedCourseId);
    const profile = useAuthStore.getState().profile;
    const meta = { faculty: profile?.faculty, department: profile?.department, level: profile?.level };
    
    const exportData = enrollments.map((student: { serverId: string, name: string, regNumber: string }, idx: number) => {
      const status = combinedRecords.get(student.serverId);
      return {
        'S/N': idx + 1,
        'Name': student.name,
        'Reg Number': student.regNumber,
        'Status': status?.toUpperCase() || 'UNMARKED',
      };
    });

    const filename = `attendance_${selectedCourse?.code || 'session'}_${currentSession.date}`;
    const title = `${selectedCourse?.code || 'Attendance'} - ${currentSession.title} (${currentSession.date})`;

    switch (format) {
      case 'csv': exportToCSV(exportData, filename, meta); break;
      case 'xlsx': exportToXLSX(exportData, filename, meta); break;
      case 'pdf': exportToPDF(exportData, title, filename, meta); break;
      case 'text': { const text = exportToText(exportData, title, meta); downloadText(text, filename); break; }
      case 'share': { const text = exportToText(exportData, title, meta); shareData(text, title); break; }
    }
  };

  const combinedRecords = useMemo(() => {
    const map = new Map<string, 'present' | 'absent' | 'excused' | null>();
    const active = records?.filter(r => r.isDeleted !== 1) || [];
    active.forEach(r => map.set(r.studentId, r.status));
    for (const [studentId, status] of Object.entries(pendingChanges)) {
      if (status === 'reset') {
        map.delete(studentId);
      } else {
        map.set(studentId, status as 'present' | 'absent' | 'excused');
      }
    }
    return map;
  }, [records, pendingChanges]);

  const stats = useMemo(() => {
    let present = 0, absent = 0, excused = 0;
    combinedRecords.forEach(status => {
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
      else if (status === 'excused') excused++;
    });
    return {
      present,
      absent,
      excused,
      total: enrollments?.length || 0
    };
  }, [combinedRecords, enrollments]);

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
          {courses === undefined ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" role="status" />
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {displayedCourses?.map(course => (
                <motion.div key={course.serverId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="card border-0 bg-white shadow-sm p-3 d-flex flex-row align-items-center gap-3 cursor-pointer rounded-4 transition-all active-scale" onClick={() => setSelectedCourseId(course.serverId)}>
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
          )}

          {courses && courses.length > itemsPerPage && (
            <div className="d-flex justify-content-between align-items-center mt-4">
              <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={coursePage === 1} onClick={() => setCoursePage(p => Math.max(p - 1, 1))}>PREV</button>
              <span className="xx-small fw-black text-muted uppercase">Page {coursePage} of {totalCoursePages}</span>
              <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={coursePage === totalCoursePages} onClick={() => setCoursePage(p => Math.min(p + 1, totalCoursePages))}>NEXT</button>
            </div>
          )}

          {courses !== undefined && courses.length === 0 && (
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
    const selectedCourse = courses?.find(c => c.serverId === selectedCourseId);
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
              <div key={session.serverId} className="card border-0 bg-white shadow-sm rounded-4">
                {renamingSessionId === session.serverId ? (
                  <div className="p-3 d-flex align-items-center gap-2">
                    <input
                      className="form-control form-control-sm rounded-3 fw-bold border-primary"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRenameSession(); if (e.key === 'Escape') setRenamingSessionId(null); }}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm rounded-3 px-3 fw-bold" onClick={handleRenameSession}><Check size={14} /></button>
                    <button className="btn btn-light btn-sm rounded-3 px-3 fw-bold border" onClick={() => setRenamingSessionId(null)}>✕</button>
                  </div>
                ) : (
                  <div className="p-3 d-flex flex-row align-items-center gap-3 cursor-pointer active-scale" onClick={() => handleSessionSelect(session.serverId)}>
                    <div className="bg-light text-primary p-2 rounded-2"><Calendar size={20} /></div>
                    <div className="flex-grow-1">
                      <h6 className="fw-bold mb-0 text-dark text-uppercase small">{session.title}</h6>
                      <div className="xx-small fw-bold text-muted text-uppercase d-flex align-items-center gap-1 mt-1"><Clock size={10} /> {new Date(session.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
                    </div>
                    <button
                      className="btn btn-light btn-sm rounded-circle p-1 border-0 text-muted me-1"
                      style={{ width: 30, height: 30 }}
                      onClick={e => { e.stopPropagation(); setRenameValue(session.title); setRenamingSessionId(session.serverId); }}
                      title="Rename session"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn btn-light btn-sm rounded-circle p-1 border-0 text-danger me-1"
                      style={{ width: 30, height: 30 }}
                      onClick={e => { e.stopPropagation(); setDeletingSessionId(session.serverId); }}
                      title="Delete session"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className="text-muted opacity-50" />
                  </div>
                )}
              </div>
            ))}
            {sessions?.length === 0 && (
              <div className="text-center py-5 bg-white rounded-4 border-dashed">
                <p className="xx-small fw-bold text-muted uppercase">No sessions found</p>
              </div>
            )}
      <ConfirmDialog
        open={deletingSessionId !== null}
        title="Delete Session"
        message="Are you sure you want to delete this session? This action can be reversed by an administrator."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deletingSessionId && handleDeleteSession(deletingSessionId)}
        onCancel={() => setDeletingSessionId(null)}
      />
          </div>
        </div>
      </div>
    );
  }

  // View 3: Marking Mode (AI option selection / camera / reconciliation)
  if (attendanceMode === 'choosing') {
    return (
      <AIOptionScreen
        onCancel={() => handleCancelSession()}
        onSelectManual={() => setAttendanceMode('manual')}
        onSelectAI={() => setAttendanceMode('ai-camera')}
      />
    );
  }

  if (attendanceMode === 'ai-camera') {
    return (
      <AICameraScreen
        onCancel={() => setAttendanceMode('choosing')}
        onSubmit={(images) => { setAiImages(images); setAttendanceMode('ai-reconciling'); }}
      />
    );
  }

  if (attendanceMode === 'ai-reconciling') {
    return (
      <AIReconciliationScreen
        images={aiImages}
        enrollments={enrollments || []}
        onCancel={() => setAttendanceMode('ai-camera')}
        onSave={(matchedIds) => {
          const newPending: Record<string, 'present' | 'absent' | 'excused' | 'reset'> = {};
          matchedIds.forEach(id => { newPending[id] = 'present'; });
          setPendingChanges(newPending);
          setAttendanceMode('manual');
        }}
      />
    );
  }

  // View 4: Manual Marking Mode
  const currentSession = sessions?.find(s => s.serverId === activeSessionId);
  



  return (
    <div className="attendance-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm sticky-top" style={{ zIndex: 100 }}>
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div className="d-flex align-items-center gap-3 overflow-hidden">
            <button className="btn btn-light rounded-circle p-2 shadow-sm flex-shrink-0" onClick={handleCancelSession}><ArrowLeft size={20} /></button>
            <div className="overflow-hidden flex-grow-1">
              {renamingSessionId === activeSessionId ? (
                <div className="d-flex align-items-center gap-2">
                  <input
                    className="form-control form-control-sm rounded-3 fw-bold border-primary"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameSession(); if (e.key === 'Escape') setRenamingSessionId(null); }}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-sm rounded-3 px-2 fw-bold flex-shrink-0" onClick={handleRenameSession}><Check size={13} /></button>
                  <button className="btn btn-light btn-sm rounded-3 px-2 fw-bold border flex-shrink-0" onClick={() => setRenamingSessionId(null)}>✕</button>
                </div>
              ) : (
                <div className="d-flex align-items-center gap-2">
                  <h1 className="h6 fw-black mb-0 text-dark text-uppercase letter-spacing-n1 truncate">{currentSession?.title}</h1>
                  <button
                    className="btn btn-light btn-sm rounded-circle p-1 border-0 text-muted flex-shrink-0"
                    style={{ width: 26, height: 26 }}
                    onClick={() => { setRenameValue(currentSession?.title || ''); setRenamingSessionId(activeSessionId); }}
                    title="Rename session"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="btn btn-light btn-sm rounded-circle p-1 border-0 text-danger flex-shrink-0"
                    style={{ width: 26, height: 26 }}
                    onClick={() => { if (activeSessionId) setDeletingSessionId(activeSessionId); }}
                    title="Delete session"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
              <p className="xx-small fw-black text-muted mb-0 uppercase tracking-widest">{stats.present + stats.absent + stats.excused} / {stats.total} MARKED</p>
            </div>
          </div>
          <div className="bg-primary text-white rounded-pill px-3 py-1 fw-black xx-small shadow-sm">{Math.round((stats.present/stats.total)*100 || 0)}%</div>
        </div>

        {/* Stats Row */}
        <div className="row g-2 mb-3">
            <div className="col-4"><div className="bg-light p-2 rounded-3 text-center border"><div className="h6 mb-0 fw-black text-success">{stats.present}</div><div className="xx-small fw-bold text-muted">PRESENT</div></div></div>
            <div className="col-4"><div className="bg-light p-2 rounded-3 text-center border"><div className="h6 mb-0 fw-black text-danger">{stats.absent}</div><div className="xx-small fw-bold text-muted">ABSENT</div></div></div>
            <div className="col-4"><div className="bg-light p-2 rounded-3 text-center border"><div className="h6 mb-0 fw-black text-warning">{stats.excused}</div><div className="xx-small fw-bold text-muted">EXCUSED</div></div></div>
        </div>

        {/* Search & Bulk Bar */}

        {Object.keys(pendingChanges).length > 0 && (
          <div className="d-flex justify-content-between align-items-center bg-warning bg-opacity-10 text-warning-emphasis p-3 rounded-4 mb-3 border border-warning border-opacity-50">
            <div className="d-flex align-items-center gap-2">
              <span className="fw-bold small">{Object.keys(pendingChanges).length} unsaved change(s)</span>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-light border fw-bold" onClick={() => setPendingChanges({})}>Discard</button>
              <button className="btn btn-sm btn-warning fw-bold px-3" onClick={handleSaveAttendance}>Save Changes</button>
            </div>
          </div>
        )}

        <div className="d-flex gap-2">

            <div className="modern-input-unified p-1 d-flex align-items-center bg-light shadow-inner flex-grow-1">
                <Search size={16} className="text-muted ms-2" />
                <input type="text" className="form-control border-0 bg-transparent py-1 small fw-bold" placeholder="Find student..." value={markSearch} onChange={e => setMarkSearch(e.target.value)} />
            </div>
            <div className="dropdown">
                <button className="btn btn-light border rounded-3 p-2 shadow-sm" type="button" data-bs-toggle="dropdown"><Settings2 size={20} /></button>
                <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-4 p-2">
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleBulkMark('present')}><UserCheck size={16} className="text-success" /> Mark All Present</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleBulkMark('absent')}><UserX size={16} className="text-danger" /> Mark All Absent</button></li>
                    <li><hr className="dropdown-divider" /></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 text-danger" onClick={handleResetRecords}><RotateCcw size={16} /> Reset Selection</button></li>
                    <li><hr className="dropdown-divider" /></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('csv')}><FileText size={16} className="text-success" /> Export CSV</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('xlsx')}><FileSpreadsheet size={16} className="text-primary" /> Export Excel</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('pdf')}><FileText size={16} className="text-danger" /> Export PDF</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('text')}><Download size={16} className="text-muted" /> Export Text</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('share')}><Share2 size={16} className="text-info" /> Share</button></li>
                </ul>
            </div>
        </div>
      </div>

      <div className="px-4 container-mobile d-flex flex-column gap-2">
        <AnimatePresence mode="popLayout">
          {displayedEnrollments.map((student: { serverId: string, name: string, regNumber: string }) => {
            const status = combinedRecords.get(student.serverId);
            return (
              <motion.div key={student.serverId} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card border-0 bg-white shadow-sm overflow-hidden rounded-4">
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-0 text-dark text-truncate text-uppercase small letter-spacing-n1">{student.name}</h6>
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <span className="xx-small fw-black text-muted font-monospace tracking-widest">{student.regNumber}</span>
                      {!status && (
                        <span className="badge rounded-2 fw-bold" style={{ fontSize: '7px', backgroundColor: 'rgba(108,117,125,0.1)', color: '#6c757d', border: '1px dashed #adb5bd' }}>UNMARKED</span>
                      )}
                    </div>
                  </div>
                  <div className="d-flex gap-1 bg-light p-1 rounded-3">
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'present' ? 'bg-success text-white shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.serverId, 'present')}><CheckCircle size={20} /></button>
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'absent' ? 'bg-danger text-white shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.serverId, 'absent')}><XCircle size={20} /></button>
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'excused' ? 'bg-warning text-dark shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.serverId, 'excused')}><HelpCircle size={20} /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>


        {filteredEnrollments && filteredEnrollments.length > itemsPerStudentPage && (
          <div className="d-flex justify-content-between align-items-center mt-2 pb-2">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === 1} onClick={() => setStudentPage(p => Math.max(p - 1, 1))}>PREV</button>
            <span className="xx-small fw-black text-muted uppercase">Page {studentPage} of {totalStudentPages}</span>
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === totalStudentPages} onClick={() => setStudentPage(p => Math.min(p + 1, totalStudentPages))}>NEXT</button>
          </div>
        )}

        {enrollments?.length === 0 && (
          <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
            <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No students enrolled in this course</p>
          </div>
        )}

        {filteredEnrollments.length === 0 && enrollments && enrollments.length > 0 && (
          <div className="text-center py-5 opacity-50">
            <Search size={40} className="text-muted mb-2 mx-auto" />
            <p className="xx-small fw-black text-muted uppercase">No matches found for "{markSearch}"</p>
          </div>
        )}
      </div>

      {/* Confirm: Bulk mark */}

      <ConfirmDialog
        open={deletingSessionId !== null}
        title="Delete Session"
        message="Are you sure you want to delete this session? This action can be reversed by an administrator."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deletingSessionId && handleDeleteSession(deletingSessionId)}
        onCancel={() => setDeletingSessionId(null)}
      />

      <ConfirmDialog
        open={confirmBulkMarkStatus !== null}
        title={`MARK ALL ${confirmBulkMarkStatus?.toUpperCase()}`}
        message={`Mark all ${filteredEnrollments.length} displayed student${filteredEnrollments.length !== 1 ? 's' : ''} as ${confirmBulkMarkStatus?.toUpperCase()}?`}
        confirmLabel="Mark All"
        variant={confirmBulkMarkStatus === 'present' ? 'primary' : 'danger'}
        onConfirm={async () => { const s = confirmBulkMarkStatus!; setConfirmBulkMarkStatus(null); await doBulkMark(s); }}
        onCancel={() => setConfirmBulkMarkStatus(null)}
      />

      {/* Confirm: Reset records */}
      <ConfirmDialog
        open={confirmResetRecords}
        title="CLEAR ATTENDANCE"
        message={`Clear attendance for the ${filteredEnrollments.length} displayed student${filteredEnrollments.length !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Clear"
        variant="danger"
        onConfirm={async () => { setConfirmResetRecords(false); await doResetRecords(); }}
        onCancel={() => setConfirmResetRecords(false)}
      />

    </div>
  );
}
