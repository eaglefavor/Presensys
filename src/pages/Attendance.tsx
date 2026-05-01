import { useState, useEffect, useMemo } from 'react';
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
