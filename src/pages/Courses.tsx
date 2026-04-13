import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Book, Users, Trash2, Search, X, BookOpen, Edit2, ArrowLeft, CheckCircle2, UserMinus, UserPlus, Filter, Circle, Save, AlertCircle, Download } from 'lucide-react';
import { db } from '../db/db';
import toast from 'react-hot-toast';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Courses() {
  const { user } = useAuthStore();
  const activeSemester = useAppStore(state => state.activeSemester);
  const courses = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.serverId).filter(c => c.isDeleted !== 1).toArray() : [],
    [activeSemester]
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [courseForm, setCourseForm] = useState({ id: 0, serverId: '', code: '', title: '' });

  const [showEnrollModal, setShowEnrollModal] = useState<{ show: boolean, courseId?: string, courseName?: string }>({ show: false });
  const [enrollSearch, setEnrollSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [enrollFilter, setEnrollFilter] = useState<'all' | 'enrolled' | 'not_enrolled'>('all');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(enrollSearch), 300);
    return () => clearTimeout(timer);
  }, [enrollSearch]);

  // Local Enrollment State (Pending Changes)
  const [localEnrollments, setLocalEnrollments] = useState<Set<string>>(new Set());
  const [originalEnrollments, setOriginalEnrollments] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Load Enrollments when Modal Opens
  useEffect(() => {
    if (showEnrollModal.show && showEnrollModal.courseId) {
      db.enrollments.where('courseId').equals(showEnrollModal.courseId).toArray().then(records => {
        const activeRecords = records.filter(r => r.isDeleted !== 1);
        const ids = new Set(activeRecords.map(e => e.studentId));
        setLocalEnrollments(ids);
        setOriginalEnrollments(new Set(ids));
      });
    } else {
      setLocalEnrollments(new Set());
      setOriginalEnrollments(new Set());
    }
  }, [showEnrollModal.show, showEnrollModal.courseId]);

  const isDirty = useMemo(() => {
    if (localEnrollments.size !== originalEnrollments.size) return true;
    for (const id of localEnrollments) {
      if (!originalEnrollments.has(id)) return true;
    }
    return false;
  }, [localEnrollments, originalEnrollments]);

  const itemsPerPage = 5;
  const [currentPage, setCurrentPage] = useState(1);

  const allStudents = useLiveQuery(() => db.students.orderBy('name').filter(s => s.isDeleted !== 1).toArray());

  const filteredStudents = useMemo(() => {
    if (!allStudents) return [];

    return allStudents.filter(s => {
      const isEnrolled = localEnrollments.has(s.serverId);
      const matchesSearch = s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        s.regNumber.includes(debouncedSearch);
      const matchesFilter =
        enrollFilter === 'all' ? true :
          enrollFilter === 'enrolled' ? isEnrolled :
            !isEnrolled;
      return matchesSearch && matchesFilter;
    }).map(s => ({
      ...s,
      isEnrolled: localEnrollments.has(s.serverId)
    }));
  }, [allStudents, debouncedSearch, enrollFilter, localEnrollments]);

  const stats = {
    all: allStudents?.length || 0,
    enrolled: localEnrollments.size,
    notEnrolled: (allStudents?.length || 0) - localEnrollments.size
  };

  const areAllVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(s => s.isEnrolled);
  const totalPages = Math.ceil((courses?.length || 0) / itemsPerPage);
  const displayedCourses = courses?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Pagination for Enrollment Modal (Virtualization)
  const [modalPage, setModalPage] = useState(1);
  const modalItemsPerPage = 20;
  const totalModalPages = Math.ceil(filteredStudents.length / modalItemsPerPage);
  const displayedModalStudents = filteredStudents.slice((modalPage - 1) * modalItemsPerPage, modalPage * modalItemsPerPage);

  // Reset modal page when filters or search change
  useEffect(() => {
    setModalPage(1);
  }, [debouncedSearch, enrollFilter]);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSemester || !user) return;
    if (isEditing) {
      await db.courses.update(courseForm.id, { code: courseForm.code, title: courseForm.title, synced: 0 });
      setIsEditing(false);
    } else {
      await db.courses.add({
        serverId: '',
        code: courseForm.code,
        title: courseForm.title,
        semesterId: activeSemester.serverId,
        userId: user.id,
        synced: 0,
        isDeleted: 0
      } as any);
    }
    setShowAddModal(false);
    setCourseForm({ id: 0, serverId: '', code: '', title: '' });
  };

  const handleEditClick = (course: any) => {
    setCourseForm({ id: course.id, serverId: course.serverId, code: course.code, title: course.title });
    setIsEditing(true);
    setShowAddModal(true);
  };

  const handleToggleLocal = (studentId: string) => {
    const newSet = new Set(localEnrollments);
    if (newSet.has(studentId)) newSet.delete(studentId);
    else newSet.add(studentId);
    setLocalEnrollments(newSet);
  };

  const handleBulkLocal = (targetState: boolean) => {
    const newSet = new Set(localEnrollments);
    filteredStudents.forEach(s => {
      if (targetState) newSet.add(s.serverId);
      else newSet.delete(s.serverId);
    });
    setLocalEnrollments(newSet);
  };

  const handleSaveChanges = async () => {
    if (!user || !showEnrollModal.courseId) return;
    setIsSaving(true);

    try {
      const toAddIds: string[] = [];
      const toRemoveIds: string[] = [];

      for (const id of localEnrollments) {
        if (!originalEnrollments.has(id)) toAddIds.push(id);
      }
      for (const id of originalEnrollments) {
        if (!localEnrollments.has(id)) toRemoveIds.push(id);
      }

      await db.transaction('rw', db.enrollments, async () => {
        // 1. Handle Removals (Bulk)
        if (toRemoveIds.length > 0) {
          const recordsToSoftDelete = await db.enrollments
            .where('courseId').equals(showEnrollModal.courseId!)
            .filter(e => toRemoveIds.includes(e.studentId))
            .toArray();

          if (recordsToSoftDelete.length > 0) {
            await db.enrollments.bulkUpdate(
              recordsToSoftDelete.map(r => ({ key: r.id!, changes: { isDeleted: 1, synced: 0 } }))
            );
          }
        }

        // 2. Handle Additions (Bulk)
        if (toAddIds.length > 0) {
          // Check for existing tombstones to resurrect
          const existingTombstones = await db.enrollments
            .where('courseId').equals(showEnrollModal.courseId!)
            .filter(e => toAddIds.includes(e.studentId))
            .toArray();

          const tombstoneStudentIds = new Set(existingTombstones.map(t => t.studentId));
          const brandNewStudentIds = toAddIds.filter(id => !tombstoneStudentIds.has(id));

          // Resurrect existing
          if (existingTombstones.length > 0) {
            await db.enrollments.bulkUpdate(
              existingTombstones.map(t => ({ key: t.id!, changes: { isDeleted: 0, synced: 0 } }))
            );
          }

          // Create brand new
          if (brandNewStudentIds.length > 0) {
            await db.enrollments.bulkAdd(
              brandNewStudentIds.map(studentId => ({
                serverId: '',
                studentId,
                courseId: showEnrollModal.courseId!,
                userId: user.id,
                synced: 0,
                isDeleted: 0
              } as any))
            );
          }
        }
      });

      const updatedRecords = await db.enrollments.where('courseId').equals(showEnrollModal.courseId!).toArray();
      const activeRecords = updatedRecords.filter(r => r.isDeleted !== 1);
      const newIds = new Set(activeRecords.map(e => e.studentId));

      setLocalEnrollments(newIds);
      setOriginalEnrollments(new Set(newIds));
      toast.success('Changes saved successfully!');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const [confirmDeleteCourseId, setConfirmDeleteCourseId] = useState<number | null>(null);

  const handleCloseModal = () => {
    if (isDirty) {
      setConfirmCloseEnroll(true);
    } else {
      setShowEnrollModal({ show: false });
    }
  };

  const [confirmCloseEnroll, setConfirmCloseEnroll] = useState(false);

  const handleDeleteCourse = async (id: number) => {
    const course = await db.courses.get(id);
    if (!course) return;

    await db.transaction('rw', [db.courses, db.enrollments], async () => {
      await db.courses.update(id, { isDeleted: 1, synced: 0 });
      const enrollments = await db.enrollments.where('courseId').equals(course.serverId).toArray();
      for (const enrollment of enrollments) {
        await db.enrollments.update(enrollment.id!, { isDeleted: 1, synced: 0 });
      }
    });
  };

  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExportExcel = async (courseId: string, courseCode: string) => {
    setIsExporting(courseId);
    try {
      // 1. Get all sessions for this course
      const sessions = await db.attendanceSessions.where('courseId').equals(courseId).filter(s => s.isDeleted !== 1).sortBy('date');

      // 2. Get all enrollments for this course
      const activeEnrollments = await db.enrollments.where('courseId').equals(courseId).filter(e => e.isDeleted !== 1).toArray();
      const studentIds = activeEnrollments.map(e => e.studentId);

      // 3. Get student details
      const students = await db.students.where('serverId').anyOf(studentIds).filter(s => s.isDeleted !== 1).sortBy('name');

      // 4. Get all attendance records for these sessions
      const sessionIds = sessions.map(s => s.serverId);
      const records = await db.attendanceRecords.where('sessionId').anyOf(sessionIds).filter(r => r.isDeleted !== 1).toArray();

      // 5. Build the Excel Data Matrix
      const excelData: any[] = [];

      // Headers
      const headers = ['S/N', 'Reg Number', 'Name'];
      sessions.forEach(s => {
        const dateStr = new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        headers.push(`${s.title}\n(${dateStr})`);
      });
      headers.push('Total Classes', 'Total Present', '% Score');
      excelData.push(headers);

      // Student Rows
      students.forEach((student, index) => {
        const rowData: any[] = [
          index + 1,
          student.regNumber,
          student.name
        ];

        let presentCount = 0;
        let validSessionsCount = sessions.length;

        sessions.forEach(session => {
          const record = records.find(r => r.sessionId === session.serverId && r.studentId === student.serverId);
          if (record) {
            if (record.status === 'present') {
              rowData.push('P');
              presentCount++;
            } else if (record.status === 'absent') {
              rowData.push('A');
            } else if (record.status === 'excused') {
              rowData.push('E');
              // Exclude excused from total classes? Usually yes in UNIZIK, or count as 'present'. Let's count as present for now or adjust total.
              // For strict calculation:
              validSessionsCount--; // Or keep it and don't count present. Let's just put 'E'.
            } else {
              rowData.push('-');
            }
          } else {
            rowData.push('-');
          }
        });

        // Ensure we don't divide by zero
        const actualTotalSessions = Math.max(1, validSessionsCount);
        const percentage = sessions.length > 0 ? Math.round((presentCount / actualTotalSessions) * 100) : 0;

        rowData.push(sessions.length, presentCount, `${percentage}%`);
        excelData.push(rowData);
      });

      // Create Workbook
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Basic Column Sizing
      const wscols = [
        { wch: 5 },  // S/N
        { wch: 15 }, // Reg No
        { wch: 30 }  // Name
      ];
      // Add width for each session
      sessions.forEach(() => wscols.push({ wch: 12 }));
      wscols.push({ wch: 15 }, { wch: 15 }, { wch: 10 }); // Totals
      ws['!cols'] = wscols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");

      // Download
      XLSX.writeFile(wb, `UNIZIK_Attendance_${courseCode.replace(' ', '_')}.xlsx`);

    } catch (error) {
      console.error("Export Failed", error);
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
            onClick={() => { setIsEditing(false); setCourseForm({ id: 0, serverId: '', code: '', title: '' }); setShowAddModal(true); }}
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="px-4 container-mobile">
        <div className="d-flex flex-column gap-3">
          <AnimatePresence mode="popLayout">
            {displayedCourses?.map(course => (
              <motion.div key={course.serverId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                <div className="card border-0 bg-white shadow-sm overflow-hidden rounded-4">
                  <div className="card-body p-3 d-flex align-items-center gap-3">
                    <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3 flex-shrink-0" style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Book size={24} />
                    </div>
                    <div className="flex-grow-1 overflow-hidden" onClick={() => setShowEnrollModal({ show: true, courseId: course.serverId, courseName: course.title })} style={{ cursor: 'pointer' }}>
                      <h6 className="fw-black mb-0 text-dark text-truncate text-uppercase letter-spacing-n1">{course.code}</h6>
                      <p className="xx-small fw-bold text-muted mb-0 text-truncate text-uppercase">{course.title}</p>
                    </div>
                  </div>
                  <div className="p-2 border-top bg-light d-flex gap-2">
                    <button
                      className="btn btn-white border flex-grow-1 py-1 px-2 rounded-3 fw-bold xx-small text-primary d-flex align-items-center justify-content-center gap-1"
                      onClick={() => setShowEnrollModal({ show: true, courseId: course.serverId, courseName: course.title })}
                    >
                      <Users size={12} /> ENROLL
                    </button>
                    <button
                      className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-success d-flex align-items-center justify-content-center gap-1"
                      onClick={() => handleExportExcel(course.serverId, course.code)}
                      disabled={isExporting === course.serverId}
                    >
                      {isExporting === course.serverId ? <div className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }} /> : <Download size={12} />} EXPORT
                    </button>
                    <button
                      className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-dark d-flex align-items-center justify-content-center gap-1"
                      onClick={() => handleEditClick(course)}
                    >
                      <Edit2 size={12} /> EDIT
                    </button>
                    <button
                      className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-danger d-flex align-items-center justify-content-center gap-1"
                      onClick={() => setConfirmDeleteCourseId(course.id!)}
                    >
                      <Trash2 size={12} /> DELETE
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {courses?.length === 0 && (
            <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
              <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No courses listed for this cycle</p>
            </div>
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

      {/* Add/Edit Course Modal */}
      {showAddModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1050 }}>
          <motion.div className="modal-dialog modal-dialog-centered px-3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-content border-0 shadow-2xl rounded-4">
              <div className="modal-header border-bottom-0 p-4 pb-0">
                <h5 className="fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>{isEditing ? 'EDIT COURSE' : 'NEW COURSE'}</h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>
              <form onSubmit={handleAddCourse}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">COURSE CODE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-black text-uppercase" placeholder="e.g. CSC 401" required value={courseForm.code} onChange={e => setCourseForm({ ...courseForm, code: e.target.value.toUpperCase() })} /></div>
                  </div>
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">COURSE TITLE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold text-uppercase" placeholder="e.g. SOFTWARE ENGINEERING" required value={courseForm.title} onChange={e => setCourseForm({ ...courseForm, title: e.target.value.toUpperCase() })} /></div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 pt-0">
                  <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold small" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary flex-grow-1 py-3 rounded-3 shadow-lg fw-bold">{isEditing ? 'SAVE CHANGES' : 'CREATE COURSE'}</button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {/* Enroll Modal (Revamped with Local State) */}
      {showEnrollModal.show && (
        <div className="modal fade show d-block" style={{ backgroundColor: '#fff', zIndex: 1050 }}>
          <div className="container-fluid h-100 p-0 d-flex flex-column">
            {/* Header */}
            <div className="p-4 border-bottom d-flex align-items-center justify-content-between bg-white sticky-top">
              <div className="d-flex align-items-center gap-3">
                <button className="btn btn-light rounded-circle p-2" onClick={handleCloseModal}><ArrowLeft size={20} /></button>
                <div>
                  <h5 className="fw-black mb-0 text-primary uppercase">MANAGE STUDENTS</h5>
                  <p className="xx-small fw-bold text-muted mb-0">{showEnrollModal.courseName}</p>
                </div>
              </div>
              <button className="btn btn-light rounded-circle p-2" onClick={handleCloseModal}><X size={24} /></button>
            </div>

            {/* Stats Bar */}
            <div className="bg-light px-4 py-3 d-flex justify-content-between align-items-center border-bottom">
              <div className="text-center">
                <h6 className="fw-black mb-0 text-dark">{stats.all}</h6>
                <div className="xx-small fw-bold text-muted uppercase">Total</div>
              </div>
              <div className="vr opacity-25"></div>
              <div className="text-center">
                <h6 className="fw-black mb-0 text-success">{stats.enrolled}</h6>
                <div className="xx-small fw-bold text-muted uppercase">Enrolled</div>
              </div>
              <div className="vr opacity-25"></div>
              <div className="text-center">
                <h6 className="fw-black mb-0 text-danger">{stats.notEnrolled}</h6>
                <div className="xx-small fw-bold text-muted uppercase">Not Enrolled</div>
              </div>
            </div>

            {/* Controls */}
            <div className="p-3 bg-white border-bottom sticky-top" style={{ top: '80px', zIndex: 1020 }}>
              {/* Tabs */}
              <div className="d-flex p-1 bg-light rounded-3 mb-3">
                <button className={`btn btn-sm flex-grow-1 fw-bold rounded-2 py-2 small ${enrollFilter === 'all' ? 'bg-white shadow-sm text-primary' : 'text-muted'}`} onClick={() => setEnrollFilter('all')}>All</button>
                <button className={`btn btn-sm flex-grow-1 fw-bold rounded-2 py-2 small ${enrollFilter === 'enrolled' ? 'bg-white shadow-sm text-success' : 'text-muted'}`} onClick={() => setEnrollFilter('enrolled')}>Enrolled</button>
                <button className={`btn btn-sm flex-grow-1 fw-bold rounded-2 py-2 small ${enrollFilter === 'not_enrolled' ? 'bg-white shadow-sm text-danger' : 'text-muted'}`} onClick={() => setEnrollFilter('not_enrolled')}>Not Enrolled</button>
              </div>

              {/* Search */}
              <div className="modern-input-unified p-1 d-flex align-items-center bg-white shadow-inner">
                <Search size={18} className="text-muted ms-2" />
                <input type="text" className="form-control border-0 bg-transparent py-2 small fw-bold" placeholder="Search students..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} />
              </div>
            </div>

            {/* List */}
            <div className="flex-grow-1 overflow-auto bg-white">
              {displayedModalStudents.length === 0 ? (
                <div className="h-100 d-flex flex-column align-items-center justify-content-center p-4 text-center opacity-50">
                  {enrollFilter === 'not_enrolled' && stats.notEnrolled === 0 ? (
                    <>
                      <CheckCircle2 size={48} className="text-success mb-3" />
                      <h6 className="fw-black">ALL STUDENTS ENROLLED!</h6>
                      <p className="small text-muted">Great job, everyone is in.</p>
                    </>
                  ) : (
                    <>
                      <Filter size={48} className="text-muted mb-3" />
                      <h6 className="fw-black">NO STUDENTS FOUND</h6>
                      <p className="small text-muted">Try adjusting your search or filters.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {displayedModalStudents.map(student => (
                    <div key={student.serverId} className="list-group-item p-3 d-flex justify-content-between align-items-center border-0 border-bottom" style={{ backgroundColor: student.isEnrolled ? 'rgba(0,105,148,0.03)' : 'transparent' }}>
                      <div className="d-flex align-items-center gap-3 overflow-hidden">
                        <div className={`p-1 rounded-circle ${student.isEnrolled ? 'text-success' : 'text-muted opacity-25'}`}>
                          {student.isEnrolled ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </div>
                        <div className="overflow-hidden">
                          <div className="fw-bold small text-dark text-truncate">{student.name}</div>
                          <div className="xx-small fw-bold text-muted font-monospace">{student.regNumber}</div>
                        </div>
                      </div>
                      <button
                        className={`btn btn-sm fw-bold rounded-pill px-3 py-1 d-flex align-items-center gap-1 ${student.isEnrolled ? 'btn-outline-danger border-0 bg-danger-subtle text-danger' : 'btn-outline-primary border-0 bg-primary-subtle text-primary'}`}
                        onClick={() => handleToggleLocal(student.serverId)}
                      >
                        {student.isEnrolled ? <><UserMinus size={14} /> Remove</> : <><UserPlus size={14} /> Enroll</>}
                      </button>
                    </div>
                  ))}

                  {/* Modal Pagination Controls */}
                  {totalModalPages > 1 && (
                    <div className="p-3 bg-light d-flex justify-content-between align-items-center border-top">
                      <button className="btn btn-white border btn-sm fw-bold px-3" disabled={modalPage === 1} onClick={() => setModalPage(p => Math.max(p - 1, 1))}>PREV</button>
                      <span className="xx-small fw-black text-muted uppercase">Page {modalPage} of {totalModalPages}</span>
                      <button className="btn btn-white border btn-sm fw-bold px-3" disabled={modalPage === totalModalPages} onClick={() => setModalPage(p => Math.min(p + 1, totalModalPages))}>NEXT</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="p-4 bg-white border-top shadow-lg sticky-bottom">
              {isDirty ? (
                <div className="d-flex flex-column gap-2 animate-in">
                  <div className="d-flex align-items-center gap-2 text-warning mb-1">
                    <AlertCircle size={16} />
                    <span className="xx-small fw-bold">You have unsaved changes</span>
                  </div>
                  <button
                    className="btn btn-success w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2"
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                  >
                    {isSaving ? <div className="spinner-border spinner-border-sm" /> : <><Save size={20} /> SAVE CHANGES</>}
                  </button>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {/* Contextual Bulk Actions */}
                  {enrollFilter === 'not_enrolled' && stats.notEnrolled > 0 && (
                    <button className="btn btn-primary w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" onClick={() => handleBulkLocal(true)}>
                      <CheckCircle2 size={20} /> ENROLL ALL SHOWN ({filteredStudents.length})
                    </button>
                  )}
                  {enrollFilter === 'enrolled' && stats.enrolled > 0 && (
                    <button className="btn btn-outline-danger w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" onClick={() => handleBulkLocal(false)}>
                      <UserMinus size={20} /> REMOVE ALL SHOWN ({filteredStudents.length})
                    </button>
                  )}
                  {enrollFilter === 'all' && (
                    <button className={`btn w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2 ${areAllVisibleSelected ? 'btn-outline-danger' : 'btn-primary'}`} onClick={() => handleBulkLocal(!areAllVisibleSelected)}>
                      {areAllVisibleSelected ? <><UserMinus size={20} /> REMOVE ALL SHOWN</> : <><CheckCircle2 size={20} /> ENROLL ALL SHOWN</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteCourseId !== null}
        title="Delete Course"
        message="Delete this course and all its enrollments? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (confirmDeleteCourseId !== null) handleDeleteCourse(confirmDeleteCourseId); setConfirmDeleteCourseId(null); }}
        onCancel={() => setConfirmDeleteCourseId(null)}
      />

      <ConfirmDialog
        open={confirmCloseEnroll}
        title="Unsaved Changes"
        message="You have unsaved enrollment changes. Are you sure you want to close without saving?"
        confirmLabel="Discard Changes"
        variant="warning"
        onConfirm={() => { setConfirmCloseEnroll(false); setShowEnrollModal({ show: false }); }}
        onCancel={() => setConfirmCloseEnroll(false)}
      />

      <style>{`
        /* Styles moved to index.css */
      `}</style>
    </div>
  );
}
