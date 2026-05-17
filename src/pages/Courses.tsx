import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ArrowLeft, Book, Users, Trash2, BookOpen, Edit2, Download, Clock, AlertTriangle } from 'lucide-react';
import { db } from '../db/db';
import toast from 'react-hot-toast';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import ConfirmDialog from '../components/ConfirmDialog';
import EnrollmentModal from '../components/course/EnrollmentModal';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Everyday'];

interface SlotDraft {
  key: string;
  serverId?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function rangesOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && s2 < e1;
}

export default function Courses() {
  const { user } = useAuthStore();
  const activeSemester = useAppStore(state => state.activeSemester);
  const courses = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.serverId).filter(c => c.isDeleted !== 1).toArray() : [],
    [activeSemester]
  );

  const allSchedules = useLiveQuery(
    () => db.courseSchedules.filter(s => s.isDeleted !== 1).toArray(),
    []
  );

  const allLecturers = useLiveQuery(
    () => db.lecturers.filter(l => l.isDeleted !== 1).toArray(),
    []
  ) || [];

  const lecturerMap = useMemo(
    () => new Map(allLecturers.map(l => [l.serverId, l.name])),
    [allLecturers]
  );

  const resolveLecturerNames = (field: string | undefined) => {
    if (!field) return '';
    return field.split(',').map(id => lecturerMap.get(id.trim()) || id.trim()).filter(Boolean).join(', ');
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [courseForm, setCourseForm] = useState({ id: 0, serverId: crypto.randomUUID(), code: '', title: '', lecturers: '' });
  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [slotDraft, setSlotDraft] = useState<{ dayOfWeek: string; startTime: string; endTime: string }>({ dayOfWeek: 'Monday', startTime: '', endTime: '' });
  const conflictWarning = (slotDraft.startTime && slotDraft.endTime) ? checkConflict(slotDraft, courseForm.serverId) : null;

  const [showEnrollModal, setShowEnrollModal] = useState<{ show: boolean, courseId?: string, courseName?: string }>({ show: false });
  const itemsPerPage = 5;
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil((courses?.length || 0) / itemsPerPage);
  const displayedCourses = courses?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const checkConflict = (draft: { dayOfWeek: string; startTime: string; endTime: string }, excludeCourseServerId?: string): string | null => {
    if (!draft.startTime || !draft.endTime || !allSchedules || !courses) return null;

    const draftStart = toMinutes(draft.startTime);
    const draftEnd = toMinutes(draft.endTime);
    if (draftStart >= draftEnd) return null;

    for (const sched of allSchedules) {
      if (sched.courseId === excludeCourseServerId) continue;
      // 'Everyday' matches all days; specific days match themselves and 'Everyday' slots
      const daysMatch =
        draft.dayOfWeek === 'Everyday' ||
        sched.dayOfWeek === 'Everyday' ||
        sched.dayOfWeek === draft.dayOfWeek;
      if (!daysMatch) continue;

      const schedStart = toMinutes(sched.startTime);
      const schedEnd = toMinutes(sched.endTime);
      if (rangesOverlap(draftStart, draftEnd, schedStart, schedEnd)) {
        const conflictingCourse = courses.find(c => c.serverId === sched.courseId);
        return conflictingCourse
          ? `Conflict with ${conflictingCourse.code} (${sched.dayOfWeek} ${sched.startTime}–${sched.endTime})`
          : 'Schedule conflict detected';
      }
    }
    return null;
  };

  useEffect(() => {
    if (slotDraft.startTime && slotDraft.endTime) {
      setConflictWarning(checkConflict(slotDraft, courseForm.serverId));
    } else {
      setConflictWarning(null);
    }
  }, [slotDraft, allSchedules, courseForm.serverId, courses]);

  const handleAddSlot = () => {
    if (!slotDraft.startTime || !slotDraft.endTime) {
      toast.error('Please set both start and end time.');
      return;
    }
    if (toMinutes(slotDraft.startTime) >= toMinutes(slotDraft.endTime)) {
      toast.error('End time must be after start time.');
      return;
    }
    setSlots(prev => [...prev, {
      key: crypto.randomUUID(),
      dayOfWeek: slotDraft.dayOfWeek,
      startTime: slotDraft.startTime,
      endTime: slotDraft.endTime,
    }]);
    setSlotDraft({ dayOfWeek: 'Monday', startTime: '', endTime: '' });
    setConflictWarning(null);
  };

  const handleRemoveSlot = (key: string) => {
    setSlots(prev => prev.filter(s => s.key !== key));
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSemester || !user) return;

    if (isEditing) {
      await db.courses.update(courseForm.id, {
        code: courseForm.code,
        title: courseForm.title,
        lecturers: courseForm.lecturers,
      });

      const existingSlots = allSchedules?.filter(s => s.courseId === courseForm.serverId) ?? [];
      const incomingServerIds = new Set(slots.filter(s => s.serverId).map(s => s.serverId!));
      for (const existing of existingSlots) {
        if (!incomingServerIds.has(existing.serverId)) {
          await db.courseSchedules.update(existing.id!, { isDeleted: 1 });
        }
      }
      for (const slot of slots.filter(s => !s.serverId)) {
        await db.courseSchedules.add({
          serverId: crypto.randomUUID(),
          courseId: courseForm.serverId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          userId: user.id,
          synced: 0,
          isDeleted: 0,
        } as unknown as import('../db/db').CourseSchedule);
      }
    } else {
      const newCourseId = crypto.randomUUID();
      await db.courses.add({
        serverId: newCourseId,
        code: courseForm.code,
        title: courseForm.title,
        lecturers: courseForm.lecturers,
        semesterId: activeSemester.serverId,
        userId: user.id,
        synced: 0,
        isDeleted: 0,
      } as unknown as import('../db/db').Course);

      for (const slot of slots) {
        await db.courseSchedules.add({
          serverId: crypto.randomUUID(),
          courseId: newCourseId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          userId: user.id,
          synced: 0,
          isDeleted: 0,
        } as unknown as import('../db/db').CourseSchedule);
      }
    }

    setShowAddModal(false);
    setCourseForm({ id: 0, serverId: crypto.randomUUID(), code: '', title: '', lecturers: '' });
    setSlots([]);
    setIsEditing(false);
  };

  const handleEditClick = (course: import('../db/db').Course) => {
    const existingSlots = allSchedules?.filter(s => s.courseId === course.serverId) ?? [];
    setCourseForm({ id: course.id || 0, serverId: course.serverId as ReturnType<typeof crypto.randomUUID>, code: course.code, title: course.title, lecturers: course.lecturers || '' });
    setSlots(existingSlots.map(s => ({
      key: s.serverId,
      serverId: s.serverId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
    })));
    setSlotDraft({ dayOfWeek: 'Monday', startTime: '', endTime: '' });
    setConflictWarning(null);
    setIsEditing(true);
    setShowAddModal(true);
  };

  const [confirmDeleteCourseId, setConfirmDeleteCourseId] = useState<number | null>(null);

  const handleDeleteCourse = async (id: number) => {
    const course = await db.courses.get(id);
    if (!course) return;

    await db.transaction('rw', [db.courses, db.enrollments, db.courseSchedules], async () => {
      await db.courses.update(id, { isDeleted: 1 });
      await db.enrollments.where('courseId').equals(course.serverId).modify({ isDeleted: 1 });
      await db.courseSchedules.where('courseId').equals(course.serverId).modify({ isDeleted: 1 });
    });
  };

  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExportExcel = async (courseId: string, courseCode: string) => {
    setIsExporting(courseId);
    try {
      const sessions = await db.attendanceSessions.where('courseId').equals(courseId).filter(s => s.isDeleted !== 1).sortBy('date');
      const activeEnrollments = await db.enrollments.where('courseId').equals(courseId).filter(e => e.isDeleted !== 1).toArray();
      const studentIds = activeEnrollments.map(e => e.studentId);
      const students = await db.students.where('serverId').anyOf(studentIds).filter(s => s.isDeleted !== 1).sortBy('name');
      const sessionIds = sessions.map(s => s.serverId);
      const records = await db.attendanceRecords.where('sessionId').anyOf(sessionIds).filter(r => r.isDeleted !== 1).toArray();

      const excelData: unknown[][] = [];
      const headers = ['S/N', 'Reg Number', 'Name'];
      sessions.forEach(s => {
        const dateStr = new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        headers.push(`${s.title}\n(${dateStr})`);
      });
      headers.push('Total Classes', 'Total Present', '% Score');
      excelData.push(headers);

      students.forEach((student, index) => {
        const rowData: unknown[] = [index + 1, student.regNumber, student.name];
        let presentCount = 0;
        let validSessionsCount = sessions.length;

        sessions.forEach(session => {
          const record = records.find(r => r.sessionId === session.serverId && r.studentId === student.serverId);
          if (record) {
            if (record.status === 'present') { rowData.push('P'); presentCount++; }
            else if (record.status === 'absent') { rowData.push('A'); }
            else if (record.status === 'excused') { rowData.push('E'); validSessionsCount--; }
            else rowData.push('-');
          } else {
            rowData.push('-');
          }
        });

        const actualTotalSessions = Math.max(1, validSessionsCount);
        const percentage = sessions.length > 0 ? Math.round((presentCount / actualTotalSessions) * 100) : 0;
        rowData.push(sessions.length, presentCount, `${percentage}%`);
        excelData.push(rowData);
      });

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wscols = [{ wch: 5 }, { wch: 15 }, { wch: 30 }];
      sessions.forEach(() => wscols.push({ wch: 12 }));
      wscols.push({ wch: 15 }, { wch: 15 }, { wch: 10 });
      ws['!cols'] = wscols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
      XLSX.writeFile(wb, `UNIZIK_Attendance_${courseCode.replace(' ', '_')}.xlsx`);
    } catch (error) {
      console.error('Export Failed', error);
      toast.error('Failed to generate export file.');
    } finally {
      setIsExporting(null);
    }
  };

  if (!activeSemester) {
    return (
      <div className="text-center py-5 mt-5 px-4 animate-in">
        <div className="bg-light d-inline-block p-4 rounded-circle mb-4"><BookOpen size={48} className="text-muted opacity-25" /></div>
        <h4 className="fw-black text-dark letter-spacing-n1">NO ACTIVE SEMESTER</h4>
        <p className="text-muted small mb-4">Please set an active academic cycle before managing courses.</p>
        <button className="btn btn-primary rounded-pill px-5 py-3 fw-bold shadow-lg" onClick={() => window.location.href = '/semesters'}>GO TO SEMESTERS</button>
      </div>
    );
  }

  if (showAddModal) {
    return (
      <div className="courses-page animate-in min-vh-100 bg-white pb-5">
        <div className="bg-white border-bottom px-4 py-4 sticky-top shadow-sm z-3">
          <div className="d-flex align-items-center gap-3">
            <button
              className="btn btn-light rounded-circle p-2 d-flex align-items-center justify-content-center"
              onClick={() => setShowAddModal(false)}
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="h4 fw-black mb-0 text-primary" style={{ color: 'var(--primary-blue)' }}>
              {isEditing ? 'EDIT COURSE' : 'NEW COURSE'}
            </h1>
          </div>
        </div>

        <div className="container-mobile mt-4">
          <form onSubmit={handleAddCourse}>
                <div className="p-4">
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">COURSE CODE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-black text-uppercase" placeholder="e.g. TFS 214" required value={courseForm.code} onChange={e => setCourseForm({ ...courseForm, code: e.target.value.toUpperCase() })} /></div>
                  </div>
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">COURSE TITLE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold text-uppercase" placeholder="e.g. FOOD SCIENCE" required value={courseForm.title} onChange={e => setCourseForm({ ...courseForm, title: e.target.value.toUpperCase() })} /></div>
                  </div>
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">LECTURERS</label>
                    {allLecturers.length === 0 ? (
                      <p className="xx-small text-muted ps-1 mb-0">No lecturers available. Add them from the Lecturers page first.</p>
                    ) : (
                      <div className="d-flex flex-column gap-1 mt-1" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                        {allLecturers.map(l => {
                          const selectedIds = courseForm.lecturers.split(',').map(s => s.trim()).filter(Boolean);
                          const isSelected = selectedIds.includes(l.serverId);
                          return (
                            <div
                              key={l.serverId}
                              className={`rounded-3 px-3 py-2 cursor-pointer ${isSelected ? 'bg-primary bg-opacity-10 border border-primary text-primary' : 'bg-light text-dark border border-transparent'}`}
                              onClick={() => {
                                const newIds = isSelected ? selectedIds.filter(id => id !== l.serverId) : [...selectedIds, l.serverId];
                                setCourseForm({ ...courseForm, lecturers: newIds.join(',') });
                              }}
                            >
                              <span className="xx-small fw-bold">{l.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Schedule Slots */}
                  <div>
                    <label className="xx-small fw-bold text-muted ps-1 mb-2 d-block">SCHEDULE SLOTS</label>

                    {slots.length > 0 && (
                      <div className="d-flex flex-column gap-1 mb-2">
                        {slots.map(slot => (
                          <div key={slot.key} className="d-flex align-items-center gap-2 bg-primary bg-opacity-10 rounded-3 px-3 py-2">
                            <Clock size={13} className="text-primary flex-shrink-0" />
                            <span className="xx-small fw-bold text-primary flex-grow-1">{slot.dayOfWeek} · {slot.startTime} – {slot.endTime}</span>
                            <button type="button" className="btn btn-link p-0 text-danger" onClick={() => handleRemoveSlot(slot.key)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border rounded-3 p-3" style={{ backgroundColor: 'var(--bg-gray, #f8f9fa)' }}>
                      <p className="xx-small fw-black text-muted text-uppercase mb-2">Add a Time Slot</p>
                      <div className="mb-2">
                        <select className="form-select form-select-sm border fw-bold" value={slotDraft.dayOfWeek} onChange={e => setSlotDraft(d => ({ ...d, dayOfWeek: e.target.value }))}>
                          {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <label className="xx-small fw-bold text-muted mb-1">FROM</label>
                          <input type="time" className="form-control form-control-sm border fw-bold" value={slotDraft.startTime} onChange={e => setSlotDraft(d => ({ ...d, startTime: e.target.value }))} />
                        </div>
                        <div className="col-6">
                          <label className="xx-small fw-bold text-muted mb-1">TO</label>
                          <input type="time" className="form-control form-control-sm border fw-bold" value={slotDraft.endTime} onChange={e => setSlotDraft(d => ({ ...d, endTime: e.target.value }))} />
                        </div>
                      </div>
                      {conflictWarning && (
                        <div className="d-flex align-items-center gap-2 text-warning xx-small fw-bold mb-2">
                          <AlertTriangle size={12} /> {conflictWarning}
                        </div>
                      )}
                      <button type="button" className="btn btn-outline-primary w-100 rounded-3 fw-bold xx-small py-2" onClick={handleAddSlot}>
                        <Plus size={12} className="me-1" /> ADD SLOT
                      </button>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-3 px-4 pb-5 pt-3">
                  <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold small" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary flex-grow-1 py-3 rounded-3 shadow-lg fw-bold">{isEditing ? 'SAVE CHANGES' : 'CREATE COURSE'}</button>
                </div>
              </form>
        </div>
      </div>
    );
  }

  return (
    <div className="courses-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h1 className="h4 fw-black mb-0 text-primary" style={{ color: 'var(--primary-blue)' }}>COURSES</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">{activeSemester.name}</p>
          </div>
          <button
            className="btn btn-primary rounded-circle p-3 shadow-lg d-flex align-items-center justify-content-center"
            style={{ width: '52px', height: '52px' }}
            onClick={() => {
              setIsEditing(false);
              setCourseForm({ id: 0, serverId: crypto.randomUUID(), code: '', title: '', lecturers: '' });
              setSlots([]);
              setSlotDraft({ dayOfWeek: 'Monday', startTime: '', endTime: '' });
              setConflictWarning(null);
              setShowAddModal(true);
            }}
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="px-4 container-mobile">
        <div className="d-flex flex-column gap-3">
          {courses === undefined ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" role="status" />
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
              <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No courses listed for this cycle</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {displayedCourses?.map(course => {
                const courseSlots = allSchedules?.filter(s => s.courseId === course.serverId) ?? [];
                return (
                  <motion.div key={course.serverId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                    <div className="card border-0 bg-white shadow-sm overflow-hidden rounded-4">
                      <div className="card-body p-3 d-flex align-items-center gap-3">
                        <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3 flex-shrink-0" style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Book size={24} />
                        </div>
                        <div className="flex-grow-1 overflow-hidden" onClick={() => setShowEnrollModal({ show: true, courseId: course.serverId, courseName: course.title })} style={{ cursor: 'pointer' }}>
                          <h6 className="fw-black mb-0 text-dark text-truncate text-uppercase letter-spacing-n1">{course.code}</h6>
                          <p className="xx-small fw-bold text-muted mb-0 text-truncate text-uppercase">{course.title}</p>
                          {course.lecturers && (
                            <div className="mt-1 xx-small text-muted">👨‍🏫 {resolveLecturerNames(course.lecturers)}</div>
                          )}
                          {courseSlots.length > 0 ? (
                            <div className="mt-1 d-flex gap-1 flex-wrap">
                              {courseSlots.map(slot => (
                                <span key={slot.serverId} className="badge bg-primary bg-opacity-10 text-primary xx-small fw-bold rounded-2 d-inline-flex align-items-center gap-1">
                                  <Clock size={9} />{slot.dayOfWeek} {slot.startTime}–{slot.endTime}
                                </span>
                              ))}
                            </div>
                          ) : (course.dayOfWeek || course.time) ? (
                            <div className="mt-1 xx-small text-muted">📅 {course.dayOfWeek} {course.time}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="p-2 border-top bg-light d-flex gap-2">
                        <button className="btn btn-white border flex-grow-1 py-1 px-2 rounded-3 fw-bold xx-small text-primary d-flex align-items-center justify-content-center gap-1" onClick={() => setShowEnrollModal({ show: true, courseId: course.serverId, courseName: course.title })}>
                          <Users size={12} /> ENROLL
                        </button>
                        <button className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-success d-flex align-items-center justify-content-center gap-1" onClick={() => handleExportExcel(course.serverId, course.code)} disabled={isExporting === course.serverId}>
                          {isExporting === course.serverId ? <div className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }} /> : <Download size={12} />} EXPORT
                        </button>
                        <button className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-dark d-flex align-items-center justify-content-center gap-1" onClick={() => handleEditClick(course)}>
                          <Edit2 size={12} /> EDIT
                        </button>
                        <button className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-danger d-flex align-items-center justify-content-center gap-1" onClick={() => setConfirmDeleteCourseId(course.id!)}>
                          <Trash2 size={12} /> DELETE
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {courses && courses.length > itemsPerPage && (
          <div className="d-flex justify-content-between align-items-center mt-4 pt-2">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 border" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}>Prev</button>
            <span className="xx-small fw-black text-muted uppercase">Page {currentPage} of {totalPages}</span>
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 border" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}>Next</button>
          </div>
        )}
      </div>



      <EnrollmentModal
        show={showEnrollModal.show}
        courseId={showEnrollModal.courseId}
        courseName={showEnrollModal.courseName}
        onClose={() => setShowEnrollModal({ show: false })}
      />

      <ConfirmDialog
        open={confirmDeleteCourseId !== null}
        title="Delete Course"
        message="Delete this course and all its enrollments? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (confirmDeleteCourseId !== null) handleDeleteCourse(confirmDeleteCourseId!); setConfirmDeleteCourseId(null); }}
        onCancel={() => setConfirmDeleteCourseId(null)}
      />
    </div>
  );
}
