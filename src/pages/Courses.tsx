import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Book, Users, Trash2, Search, X, BookOpen } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function Courses() {
  const activeSemester = useAppStore(state => state.activeSemester);
  const courses = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.id!).toArray() : [],
    [activeSemester]
  );
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCourse, setNewCourse] = useState({ code: '', title: '' });
  
  const [showEnrollModal, setShowEnrollModal] = useState<{show: boolean, courseId?: number, courseName?: string}>({ show: false });
  const [enrollSearch, setEnrollSearch] = useState('');
  
  const allStudents = useLiveQuery(() => db.students.orderBy('name').toArray());
  const currentEnrollments = useLiveQuery(
    () => showEnrollModal.courseId ? db.enrollments.where('courseId').equals(showEnrollModal.courseId).toArray() : [],
    [showEnrollModal.courseId]
  );

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSemester) return;
    await db.courses.add({ ...newCourse, semesterId: activeSemester.id! });
    setShowAddModal(false);
    setNewCourse({ code: '', title: '' });
  };

  const handleToggleEnroll = async (studentId: number) => {
    if (!showEnrollModal.courseId) return;
    const existing = currentEnrollments?.find(e => e.studentId === studentId);
    if (existing) await db.enrollments.delete(existing.id!);
    else await db.enrollments.add({ studentId, courseId: showEnrollModal.courseId });
  };

  const handleDeleteCourse = async (id: number) => {
    if (confirm('Delete this course and all its enrollments?')) {
      await db.transaction('rw', [db.courses, db.enrollments], async () => {
        await db.enrollments.where('courseId').equals(id).delete();
        await db.courses.delete(id);
      });
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
      {/* Simplistic Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h1 className="h4 fw-black mb-0 text-primary" style={{ color: 'var(--primary-blue)' }}>COURSES</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">{activeSemester.name}</p>
          </div>
          <button className="btn btn-primary rounded-circle p-3 shadow-lg d-flex align-items-center justify-content-center" style={{ width: '52px', height: '52px' }} onClick={() => setShowAddModal(true)}>
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="px-4 container-mobile">
        <div className="d-flex flex-column gap-3">
          <AnimatePresence mode="popLayout">
            {courses?.map(course => (
              <motion.div key={course.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                <div className="card border-0 bg-white shadow-sm overflow-hidden rounded-4">
                  <div className="card-body p-3 d-flex align-items-center gap-3">
                    <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3 flex-shrink-0" style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Book size={24} />
                    </div>
                    <div className="flex-grow-1 overflow-hidden" onClick={() => setShowEnrollModal({ show: true, courseId: course.id, courseName: course.title })} style={{ cursor: 'pointer' }}>
                      <h6 className="fw-black mb-0 text-dark text-truncate text-uppercase letter-spacing-n1">{course.code}</h6>
                      <p className="xx-small fw-bold text-muted mb-0 text-truncate">{course.title}</p>
                    </div>
                    <div className="d-flex gap-1">
                      <button className="btn btn-link text-muted p-2" onClick={() => setShowEnrollModal({ show: true, courseId: course.id, courseName: course.title })}><Users size={18} /></button>
                      <button className="btn btn-link text-danger p-2" onClick={() => handleDeleteCourse(course.id!)}><Trash2 size={18} /></button>
                    </div>
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
      </div>

      {/* Add Course Modal */}
      {showAddModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1050 }}>
          <motion.div className="modal-dialog modal-dialog-centered px-3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-content border-0 shadow-2xl rounded-4">
              <div className="modal-header border-bottom-0 p-4 pb-0">
                <h5 className="fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>NEW COURSE</h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>
              <form onSubmit={handleAddCourse}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">COURSE CODE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-black text-uppercase" placeholder="e.g. CSC 401" required value={newCourse.code} onChange={e => setNewCourse({...newCourse, code: e.target.value.toUpperCase()})} /></div>
                  </div>
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">COURSE TITLE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold" placeholder="e.g. Software Engineering" required value={newCourse.title} onChange={e => setNewCourse({...newCourse, title: e.target.value})} /></div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 pt-0">
                  <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold small" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary flex-grow-1 py-3 rounded-3 shadow-lg fw-bold">CREATE COURSE</button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {/* Enroll Modal (Bottom Sheet Style) */}
      <AnimatePresence>
        {showEnrollModal.show && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 2000 }} onClick={() => setShowEnrollModal({ show: false })} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="modal fade show d-block" style={{ zIndex: 2001, top: 'auto', bottom: 0 }}>
              <div className="modal-dialog modal-dialog-centered m-0" style={{ maxWidth: 'none' }}>
                <div className="modal-content border-0 shadow-2xl rounded-top-5 overflow-hidden" style={{ maxHeight: '90vh' }}>
                  <div className="modal-header bg-white border-bottom p-4">
                    <div>
                      <h5 className="fw-black mb-0 text-primary text-uppercase letter-spacing-n1">ENROLL STUDENTS</h5>
                      <p className="xx-small fw-bold text-muted mb-0 tracking-widest">{showEnrollModal.courseName}</p>
                    </div>
                    <button className="btn btn-light rounded-circle p-2" onClick={() => setShowEnrollModal({ show: false })}><X size={20} /></button>
                  </div>
                  <div className="p-3 bg-light border-bottom">
                    <div className="modern-input-unified p-1 d-flex align-items-center bg-white shadow-inner">
                      <Search size={18} className="text-muted ms-2" />
                      <input type="text" className="form-control border-0 bg-transparent py-2 small fw-bold" placeholder="Search to enroll..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="modal-body p-0 overflow-auto">
                    <div className="list-group list-group-flush">
                      {allStudents?.filter(s => s.name.toLowerCase().includes(enrollSearch.toLowerCase()) || s.regNumber.includes(enrollSearch)).map(student => {
                        const isEnrolled = currentEnrollments?.some(e => e.studentId === student.id);
                        return (
                          <div key={student.id} className="list-group-item p-3 d-flex justify-content-between align-items-center border-0 border-bottom" style={{ backgroundColor: isEnrolled ? 'rgba(0,105,148,0.03)' : 'transparent' }}>
                            <div className="overflow-hidden">
                              <div className="fw-bold small text-dark text-truncate">{student.name}</div>
                              <div className="xx-small fw-bold text-muted font-monospace">{student.regNumber}</div>
                            </div>
                            <div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={isEnrolled || false} onChange={() => handleToggleEnroll(student.id!)} style={{ width: '40px', height: '20px' }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="p-4 bg-white border-top"><button className="btn btn-primary w-100 py-3 rounded-3 fw-bold shadow-sm" onClick={() => setShowEnrollModal({ show: false })}>FINISH ENROLLMENT</button></div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1.2px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
        .courses-page { background-color: var(--bg-gray); }
        .rounded-top-5 { border-top-left-radius: 32px !important; border-top-right-radius: 32px !important; }
        .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
      `}</style>
    </div>
  );
}
