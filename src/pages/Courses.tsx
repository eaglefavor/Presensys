import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Book, Users, Trash2, Search, X, BookOpen, Edit2, ArrowLeft, CheckCircle2, UserMinus, UserPlus, Filter, Circle } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function Courses() {
  const { user } = useAuthStore();
  const activeSemester = useAppStore(state => state.activeSemester);
  const courses = useLiveQuery(
    () => activeSemester ? db.courses.where('semesterId').equals(activeSemester.id!).toArray() : [],
    [activeSemester]
  );
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [courseForm, setCourseForm] = useState({ id: 0, code: '', title: '' });
  
  const [showEnrollModal, setShowEnrollModal] = useState<{show: boolean, courseId?: number, courseName?: string}>({ show: false });
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollFilter, setEnrollFilter] = useState<'all' | 'enrolled' | 'not_enrolled'>('all');
  
  // Pagination
  const itemsPerPage = 5;
  const [currentPage, setCurrentPage] = useState(1);

  const allStudents = useLiveQuery(() => db.students.orderBy('name').toArray());
  const currentEnrollments = useLiveQuery(
    () => showEnrollModal.courseId ? db.enrollments.where('courseId').equals(showEnrollModal.courseId).toArray() : [],
    [showEnrollModal.courseId]
  );

  // Derived lists
  const enrolledStudentIds = new Set(currentEnrollments?.map(e => e.studentId));
  
  const studentsWithStatus = allStudents?.map(s => ({
    ...s,
    isEnrolled: enrolledStudentIds.has(s.id!)
  })) || [];

  const filteredStudents = studentsWithStatus.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(enrollSearch.toLowerCase()) || s.regNumber.includes(enrollSearch);
    const matchesFilter = 
      enrollFilter === 'all' ? true :
      enrollFilter === 'enrolled' ? s.isEnrolled :
      !s.isEnrolled; // not_enrolled
    return matchesSearch && matchesFilter;
  });

  const stats = {
    all: allStudents?.length || 0,
    enrolled: currentEnrollments?.length || 0,
    notEnrolled: (allStudents?.length || 0) - (currentEnrollments?.length || 0)
  };

  const areAllVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(s => s.isEnrolled);

  // Pagination Logic
  const totalPages = Math.ceil((courses?.length || 0) / itemsPerPage);
  const displayedCourses = courses?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSemester || !user) return;
    if (isEditing) {
      await db.courses.update(courseForm.id, { code: courseForm.code, title: courseForm.title, synced: 0 });
      setIsEditing(false);
    } else {
      await db.courses.add({ ...courseForm, semesterId: activeSemester.id!, userId: user.id, synced: 0 });
    }
    setShowAddModal(false);
    setCourseForm({ id: 0, code: '', title: '' });
  };

  const handleEditClick = (course: any) => {
    setCourseForm({ id: course.id, code: course.code, title: course.title });
    setIsEditing(true);
    setShowAddModal(true);
  };

  const handleToggleEnroll = async (studentId: number) => {
    if (!showEnrollModal.courseId || !user) return;
    const existing = currentEnrollments?.find(e => e.studentId === studentId);
    if (existing) await db.enrollments.delete(existing.id!);
    else await db.enrollments.add({ studentId, courseId: showEnrollModal.courseId, userId: user.id, synced: 0 });
  };

  const handleBulkAction = async () => {
    if (!showEnrollModal.courseId || !user) return;
    
    // If filtering "Not Enrolled", action is to Enroll All Visible
    // If filtering "Enrolled", action is to Unenroll All Visible
    // If "All", we toggle based on areAllVisibleSelected state
    
    const targetState = !areAllVisibleSelected; // true = enroll, false = unenroll

    await db.transaction('rw', db.enrollments, async () => {
      for (const s of filteredStudents) {
        const isEnrolled = enrolledStudentIds.has(s.id!);
        if (targetState && !isEnrolled) {
           await db.enrollments.add({ studentId: s.id!, courseId: showEnrollModal.courseId!, userId: user.id, synced: 0 });
        } else if (!targetState && isEnrolled) {
           const enrollment = currentEnrollments?.find(e => e.studentId === s.id!);
           if (enrollment) await db.enrollments.delete(enrollment.id!);
        }
      }
    });
  };

  const handleDeleteCourse = async (id: number) => {
    if (confirm('Delete this course and all its enrollments?')) {
      await db.transaction('rw', [db.courses, db.enrollments], async () => {
        // Mark course as deleted
        await db.courses.update(id, { isDeleted: 1, synced: 0 });
        
        // Mark associated enrollments as deleted
        const enrollments = await db.enrollments.where('courseId').equals(id).toArray();
        for (const enrollment of enrollments) {
          await db.enrollments.update(enrollment.id!, { isDeleted: 1, synced: 0 });
        }
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
            onClick={() => { setIsEditing(false); setCourseForm({ id: 0, code: '', title: '' }); setShowAddModal(true); }}
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="px-4 container-mobile">
        <div className="d-flex flex-column gap-3">
          <AnimatePresence mode="popLayout">
            {displayedCourses?.map(course => (
              <motion.div key={course.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                <div className="card border-0 bg-white shadow-sm overflow-hidden rounded-4">
                  <div className="card-body p-3 d-flex align-items-center gap-3">
                    <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3 flex-shrink-0" style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Book size={24} />
                    </div>
                    <div className="flex-grow-1 overflow-hidden" onClick={() => setShowEnrollModal({ show: true, courseId: course.id, courseName: course.title })} style={{ cursor: 'pointer' }}>
                      <h6 className="fw-black mb-0 text-dark text-truncate text-uppercase letter-spacing-n1">{course.code}</h6>
                      <p className="xx-small fw-bold text-muted mb-0 text-truncate text-uppercase">{course.title}</p>
                    </div>
                  </div>
                  <div className="p-2 border-top bg-light d-flex gap-2">
                    <button 
                      className="btn btn-white border flex-grow-1 py-1 px-2 rounded-3 fw-bold xx-small text-primary d-flex align-items-center justify-content-center gap-1"
                      onClick={() => setShowEnrollModal({ show: true, courseId: course.id, courseName: course.title })}
                    >
                      <Users size={12} /> ENROLL
                    </button>
                    <button 
                      className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-dark d-flex align-items-center justify-content-center gap-1"
                      onClick={() => handleEditClick(course)}
                    >
                      <Edit2 size={12} /> EDIT
                    </button>
                    <button 
                      className="btn btn-white border py-1 px-2 rounded-3 fw-bold xx-small text-danger d-flex align-items-center justify-content-center gap-1"
                      onClick={() => handleDeleteCourse(course.id!)}
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
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-black text-uppercase" placeholder="e.g. CSC 401" required value={courseForm.code} onChange={e => setCourseForm({...courseForm, code: e.target.value.toUpperCase()})} /></div>
                  </div>
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">COURSE TITLE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold text-uppercase" placeholder="e.g. SOFTWARE ENGINEERING" required value={courseForm.title} onChange={e => setCourseForm({...courseForm, title: e.target.value.toUpperCase()})} /></div>
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

      {/* Enroll Modal (Revamped) */}
      {showEnrollModal.show && (
        <div className="modal fade show d-block" style={{ backgroundColor: '#fff', zIndex: 1050 }}>
          <div className="container-fluid h-100 p-0 d-flex flex-column">
            {/* Header */}
            <div className="p-4 border-bottom d-flex align-items-center justify-content-between bg-white sticky-top">
              <div className="d-flex align-items-center gap-3">
                <button className="btn btn-light rounded-circle p-2" onClick={() => setShowEnrollModal({ show: false })}><ArrowLeft size={20} /></button>
                <div>
                  <h5 className="fw-black mb-0 text-primary uppercase">MANAGE STUDENTS</h5>
                  <p className="xx-small fw-bold text-muted mb-0">{showEnrollModal.courseName}</p>
                </div>
              </div>
              <button className="btn btn-light rounded-circle p-2" onClick={() => setShowEnrollModal({ show: false })}><X size={24} /></button>
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
                <div className="xx-small fw-bold text-muted uppercase">Missing</div>
              </div>
            </div>

            {/* Controls */}
            <div className="p-3 bg-white border-bottom sticky-top" style={{top: '80px', zIndex: 1020}}>
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
              {filteredStudents.length === 0 ? (
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
                  {filteredStudents.map(student => (
                    <div key={student.id} className="list-group-item p-3 d-flex justify-content-between align-items-center border-0 border-bottom" style={{ backgroundColor: student.isEnrolled ? 'rgba(0,105,148,0.03)' : 'transparent' }}>
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
                        onClick={() => handleToggleEnroll(student.id!)}
                      >
                        {student.isEnrolled ? <><UserMinus size={14} /> Remove</> : <><UserPlus size={14} /> Enroll</>}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bulk Action Footer */}
            <div className="p-4 bg-white border-top shadow-lg sticky-bottom">
              {enrollFilter === 'not_enrolled' && stats.notEnrolled > 0 && (
                <button className="btn btn-primary w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" onClick={handleBulkAction}>
                  <CheckCircle2 size={20} /> ENROLL ALL SHOWN ({filteredStudents.length})
                </button>
              )}
              {enrollFilter === 'enrolled' && stats.enrolled > 0 && (
                <button className="btn btn-outline-danger w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" onClick={handleBulkAction}>
                  <UserMinus size={20} /> REMOVE ALL SHOWN ({filteredStudents.length})
                </button>
              )}
              {enrollFilter === 'all' && (
                <button className={`btn w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2 ${areAllVisibleSelected ? 'btn-outline-danger' : 'btn-primary'}`} onClick={handleBulkAction}>
                  {areAllVisibleSelected ? <><UserMinus size={20} /> REMOVE ALL SHOWN</> : <><CheckCircle2 size={20} /> ENROLL ALL SHOWN</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Styles moved to index.css */
      `}</style>
    </div>
  );
}
