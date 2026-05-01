import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Book, Users, Trash2, BookOpen, Edit2, Download } from 'lucide-react';
import { db } from '../db/db';
import toast from 'react-hot-toast';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import ConfirmDialog from '../components/ConfirmDialog';
import EnrollmentModal from '../components/course/EnrollmentModal';

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
  const itemsPerPage = 5;
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil((courses?.length || 0) / itemsPerPage);
  const displayedCourses = courses?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);


  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSemester || !user) return;
    if (isEditing) {
      await db.courses.update(courseForm.id, { code: courseForm.code, title: courseForm.title });
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
      } as unknown as import("../db/db").Course);
    }
    setShowAddModal(false);
    setCourseForm({ id: 0, serverId: '', code: '', title: '' });
  };

  const handleEditClick = (course: import("../db/db").Course) => {
    setCourseForm({ id: course.id || 0, serverId: course.serverId, code: course.code, title: course.title });
    setIsEditing(true);
    setShowAddModal(true);
  };

  const [confirmDeleteCourseId, setConfirmDeleteCourseId] = useState<number | null>(null);

  const handleDeleteCourse = async (id: number) => {
    const course = await db.courses.get(id);
    if (!course) return;

    await db.transaction('rw', [db.courses, db.enrollments], async () => {
      await db.courses.update(id, { isDeleted: 1 });
      await db.enrollments.where('courseId').equals(course.serverId).modify({ isDeleted: 1 });
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
      const excelData: unknown[][] = [];

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
        const rowData: unknown[] = [
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
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowAddModal(false)}></button>
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

      <style>{`
        /* Styles moved to index.css */
      `}</style>
    </div>
  );
}
