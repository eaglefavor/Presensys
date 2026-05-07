import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calendar } from 'lucide-react';
import { db, type LocalAttendanceRecord } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { exportToCSV, exportToXLSX, exportToPDF, exportToText, downloadText, shareData } from '../lib/ExportUtils';
import toast from 'react-hot-toast';
import AIOptionScreen from './attendance/AIOptionScreen';
import AICameraScreen from './attendance/AICameraScreen';
import AIReconciliationScreen from './attendance/AIReconciliationScreen';
import CourseSelection from './attendance/CourseSelection';
import SessionsList from './attendance/SessionsList';
import ManualMarking from './attendance/ManualMarking';
import FingerprintBlitzScreen from './attendance/FingerprintBlitzScreen';
export default function Attendance() {
  type AttendanceMethod = 'manual' | 'ai-camera' | 'fingerprint';
  const { user } = useAuthStore();
  const location = useLocation();
  const activeSemester = useAppStore(state => state.activeSemester);
  const courses = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.serverId).filter(c => c.isDeleted !== 1).toArray() : [],
    [activeSemester]
  );
  
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(location.state?.selectedCourseId || null);
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

  const [studentPage, setStudentPage] = useState(1);
  useEffect(() => {
    // Avoid setting state in effect unless necessary
    // setStudentPage(1);
  }, [debouncedMarkSearch]);

  // View 1 & 2 logic
  const [coursePage, setCoursePage] = useState(1);
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
  const [attendanceMode, setAttendanceMode] = useState<'choosing' | 'manual' | 'ai-camera' | 'ai-reconciling' | 'fingerprint' | null>(null);
  const [aiImages, setAiImages] = useState<string[]>([]);
  const [pendingMethodChoice, setPendingMethodChoice] = useState<AttendanceMethod | null>(null);
  const [initializingMethod, setInitializingMethod] = useState<AttendanceMethod | null>(null);

  const handleCreateSession = async (lecturerId: string) => {
    if (!lecturerId) return;
    if (!selectedCourseId || !user) return;
    const newSession = {
      serverId: '',
      courseId: selectedCourseId,
      date: new Date().toISOString().split('T')[0],
      title: `Session ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      lecturerId,
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
    setPendingMethodChoice(null);
    setAttendanceMode('choosing');
  };

  const handleCancelSession = () => {
    setActiveSessionId(null);
    setPendingChanges({});
    setPendingMethodChoice(null);
    setAttendanceMode(null);
  };

  const initializeSessionDefaults = async (resetSession: boolean) => {
    if (!activeSessionId || !user || !enrollments) return;
    const now = Date.now();

    await db.transaction('rw', db.attendanceRecords, async () => {
      const existing = await db.attendanceRecords.where('sessionId').equals(activeSessionId).toArray();
      const activeExisting = existing.filter(r => r.isDeleted !== 1);

      if (resetSession && activeExisting.length > 0) {
        const clearUpdates = activeExisting
          .filter(r => r.id !== undefined)
          .map(r => ({ key: r.id!, changes: { isDeleted: 1, synced: 0, timestamp: now } }));
        if (clearUpdates.length > 0) await db.attendanceRecords.bulkUpdate(clearUpdates);
      }

      const activeMap = new Map(activeExisting.map(r => [r.studentId, r]));
      const deletedMap = new Map(existing.filter(r => r.isDeleted === 1).map(r => [r.studentId, r]));

      const toRevive: { key: number, changes: Record<string, unknown> }[] = [];
      const toAdd: Omit<LocalAttendanceRecord, 'id'>[] = [];

      for (const student of enrollments) {
        if (!resetSession && activeMap.has(student.serverId)) continue;

        const deletedRecord = deletedMap.get(student.serverId);
        if (deletedRecord?.id !== undefined) {
          toRevive.push({
            key: deletedRecord.id,
            changes: { status: 'absent', isDeleted: 0, synced: 0, timestamp: now }
          });
          continue;
        }

        toAdd.push({
          serverId: '',
          sessionId: activeSessionId,
          studentId: student.serverId,
          status: 'absent',
          timestamp: now,
          synced: 0,
          userId: user.id,
          isDeleted: 0
        });
      }

      if (toRevive.length > 0) await db.attendanceRecords.bulkUpdate(toRevive);
      if (toAdd.length > 0) await db.attendanceRecords.bulkAdd(toAdd);
    });
  };

  const beginAttendanceMethod = async (method: AttendanceMethod, resetSession: boolean) => {
    if (initializingMethod) return;
    setInitializingMethod(method);
    try {
      await initializeSessionDefaults(resetSession);
      setPendingChanges({});
      setAttendanceMode(method);
    } catch (err) {
      console.error('Failed to initialize attendance session', err);
      toast.error('Failed to prepare this session. Please try again.');
    } finally {
      setInitializingMethod(null);
    }
  };

  const handleMethodChoice = (method: AttendanceMethod) => {
    if (initializingMethod) return;
    const hasSavedAttendance = (records?.length || 0) > 0;
    if (hasSavedAttendance) {
      setPendingMethodChoice(method);
      return;
    }
    void beginAttendanceMethod(method, false);
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

  const combinedRecords = (() => {
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
  })();

  const stats = (() => {
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
  })();

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
      <CourseSelection
        courses={courses}
        coursePage={coursePage}
        setCoursePage={setCoursePage}
        totalCoursePages={totalCoursePages}
        displayedCourses={displayedCourses}
        itemsPerPage={itemsPerPage}
        onSelectCourse={setSelectedCourseId}
      />
    );
  }

  // View 2: Sessions List
  if (!activeSessionId) {
    const selectedCourse = courses?.find(c => c.serverId === selectedCourseId);
    return (
      <SessionsList
        sessions={sessions}
        selectedCourse={selectedCourse}
        renamingSessionId={renamingSessionId}
        deletingSessionId={deletingSessionId}
        renameValue={renameValue}
        onClearSelectedCourse={() => setSelectedCourseId(null)}
        onCreateSession={handleCreateSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        onSessionSelect={handleSessionSelect}
        setRenamingSessionId={setRenamingSessionId}
        setDeletingSessionId={setDeletingSessionId}
        setRenameValue={setRenameValue}
      />
    );
  }

  // View 3: Marking Mode (AI option selection / camera / reconciliation)
  if (attendanceMode === 'choosing') {
    return (
      <>
        <AIOptionScreen
          onCancel={() => handleCancelSession()}
          onSelectManual={() => handleMethodChoice('manual')}
          onSelectAI={() => handleMethodChoice('ai-camera')}
          onSelectFingerprint={() => handleMethodChoice('fingerprint')}
        />

        {pendingMethodChoice && (
          <>
            <div
              className="modal-backdrop fade show d-block"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 3000 }}
              onClick={() => setPendingMethodChoice(null)}
            />
            <div
              className="modal fade show d-flex align-items-center justify-content-center"
              style={{ zIndex: 3001 }}
              role="dialog"
              aria-modal="true"
            >
              <div className="modal-dialog modal-dialog-centered px-4 w-100" style={{ maxWidth: '430px' }}>
                <div className="modal-content border-0 shadow rounded-4 overflow-hidden">
                  <div className="modal-body p-4">
                    <h5 className="fw-black mb-2 text-dark">Attendance Already Saved</h5>
                    <p className="text-muted small mb-0">
                      This session already has saved attendance. Do you want to reset and record a completely new session, or continue editing the existing data?
                    </p>
                  </div>
                  <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex flex-column gap-2">
                    <div className="d-flex gap-2 w-100">
                      <button
                        className="btn btn-light flex-grow-1 fw-bold py-2 rounded-3"
                        onClick={() => setPendingMethodChoice(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary flex-grow-1 fw-bold py-2 rounded-3"
                        onClick={() => {
                          const method = pendingMethodChoice;
                          setPendingMethodChoice(null);
                          if (method) void beginAttendanceMethod(method, false);
                        }}
                      >
                        Edit Existing
                      </button>
                    </div>
                    <button
                      className="btn btn-danger w-100 fw-bold py-2 rounded-3"
                      onClick={() => {
                        const method = pendingMethodChoice;
                        setPendingMethodChoice(null);
                        if (method) void beginAttendanceMethod(method, true);
                      }}
                    >
                      Reset Session
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </>
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

  if (attendanceMode === 'fingerprint' && activeSessionId && user) {
    return (
      <FingerprintBlitzScreen
        activeSessionId={activeSessionId}
        enrollments={enrollments || []}
        userId={user.id}
        onStop={() => setAttendanceMode('manual')}
        onCancel={() => setAttendanceMode('choosing')}
      />
    );
  }

  // View 4: Manual Marking Mode
  const currentSession = sessions?.find(s => s.serverId === activeSessionId);
  
  return (
    <ManualMarking
      currentSession={currentSession}
      renamingSessionId={renamingSessionId}
      deletingSessionId={deletingSessionId}
      renameValue={renameValue}
      stats={stats}
      pendingChanges={pendingChanges}
      markSearch={markSearch}
      confirmBulkMarkStatus={confirmBulkMarkStatus}
      confirmResetRecords={confirmResetRecords}
      displayedEnrollments={displayedEnrollments || []}
      combinedRecords={combinedRecords}
      studentPage={studentPage}
      totalStudentPages={totalStudentPages}
      filteredEnrollments={filteredEnrollments}
      enrollments={enrollments}
      itemsPerStudentPage={itemsPerStudentPage}

      onCancelSession={handleCancelSession}
      onRenameSession={handleRenameSession}
      onDeleteSession={handleDeleteSession}
      setRenamingSessionId={setRenamingSessionId}
      setDeletingSessionId={setDeletingSessionId}
      setRenameValue={setRenameValue}
      setPendingChanges={setPendingChanges}
      handleSaveAttendance={handleSaveAttendance}
      setMarkSearch={setMarkSearch}
      handleBulkMark={handleBulkMark}
      handleResetRecords={handleResetRecords}
      handleSessionExport={handleSessionExport}
      updateRecord={updateRecord}
      setStudentPage={setStudentPage}
      setConfirmBulkMarkStatus={setConfirmBulkMarkStatus}
      doBulkMark={doBulkMark}
      setConfirmResetRecords={setConfirmResetRecords}
      doResetRecords={doResetRecords}
    />
  );
}
