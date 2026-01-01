import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Book, Users, Trash2, Search } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';

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
  
  // Get all students and existing enrollments for the modal
  const allStudents = useLiveQuery(() => db.students.orderBy('name').toArray());
  const currentEnrollments = useLiveQuery(
    () => showEnrollModal.courseId ? db.enrollments.where('courseId').equals(showEnrollModal.courseId).toArray() : [],
    [showEnrollModal.courseId]
  );

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSemester) return;
    
    await db.courses.add({
      ...newCourse,
      semesterId: activeSemester.id!
    });
    
    setShowAddModal(false);
    setNewCourse({ code: '', title: '' });
  };

  const handleToggleEnroll = async (studentId: number) => {
    if (!showEnrollModal.courseId) return;
    
    const existing = currentEnrollments?.find(e => e.studentId === studentId);
    if (existing) {
      await db.enrollments.delete(existing.id!);
    } else {
      await db.enrollments.add({
        studentId,
        courseId: showEnrollModal.courseId
      });
    }
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
      <div className="text-center py-5">
        <div className="mb-3"><Book size={48} className="text-muted" /></div>
        <h3>No Active Semester</h3>
        <p className="text-muted">Please select or create an active semester first.</p>
        <button className="btn btn-primary" onClick={() => window.location.href = '/semesters'}>
          Go to Semesters
        </button>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1>Courses</h1>
          <p className="text-muted mb-0">{activeSemester.name}</p>
        </div>
        <button className="btn btn-primary d-flex align-items-center gap-2" onClick={() => setShowAddModal(true)}>
          <Plus size={20} /> Add Course
        </button>
      </div>

      <div className="row g-4">
        {courses?.map(course => (
          <div key={course.id} className="col-12 col-12">
            <div className="card h-100 shadow-sm border-0">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className="badge bg-primary-subtle text-primary border border-primary-subtle">{course.code}</span>
                  <button className="btn btn-sm text-danger opacity-50 hover-opacity-100" onClick={() => handleDeleteCourse(course.id!)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <h5 className="card-title fw-bold mb-3">{course.title}</h5>
                
                <div className="d-grid gap-2">
                  <button 
                    className="btn btn-outline-primary d-flex align-items-center justify-content-center gap-2"
                    onClick={() => setShowEnrollModal({ show: true, courseId: course.id, courseName: course.title })}
                  >
                    <Users size={18} /> Manage Enrollments
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {courses?.length === 0 && (
          <div className="col-12 text-center py-5 bg-white rounded shadow-sm">
            <div className="text-muted">No courses added yet for this semester.</div>
          </div>
        )}
      </div>

      {/* Add Course Modal */}
      {showAddModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow">
                <div className="modal-header">
                  <h5 className="modal-title">New Course</h5>
                  <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
                </div>
                <form onSubmit={handleAddCourse}>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Course Code</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        required 
                        placeholder="e.g. CSC 401"
                        value={newCourse.code}
                        onChange={e => setNewCourse({...newCourse, code: e.target.value.toUpperCase()})}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Course Title</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        required 
                        placeholder="e.g. Software Engineering"
                        value={newCourse.title}
                        onChange={e => setNewCourse({...newCourse, title: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-light" onClick={() => setShowAddModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Create Course</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Enroll Modal */}
      {showEnrollModal.show && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-fullscreen-sm-down modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content border-0 shadow-lg">
                <div className="modal-header bg-primary text-white">
                  <h5 className="modal-title">Enroll Students: {showEnrollModal.courseName}</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowEnrollModal({ show: false })}></button>
                </div>
                <div className="modal-body p-0">
                  <div className="p-3 bg-light border-bottom sticky-top">
                    <div className="input-group">
                      <span className="input-group-text bg-white"><Search size={18} /></span>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Search students to enroll..." 
                        value={enrollSearch}
                        onChange={e => setEnrollSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="list-group list-group-flush">
                    {allStudents?.filter(s => 
                      s.name.toLowerCase().includes(enrollSearch.toLowerCase()) || 
                      s.regNumber.includes(enrollSearch)
                    ).map(student => {
                      const isEnrolled = currentEnrollments?.some(e => e.studentId === student.id);
                      return (
                        <div 
                          key={student.id} 
                          className={`list-group-item d-flex justify-content-between align-items-center py-3 ${isEnrolled ? 'bg-primary-subtle' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleToggleEnroll(student.id!)}
                        >
                          <div>
                            <div className="fw-bold">{student.name}</div>
                            <div className="small text-muted">{student.regNumber}</div>
                          </div>
                          <div className={`form-check form-switch`}>
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              checked={isEnrolled || false} 
                              readOnly 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-primary px-4" onClick={() => setShowEnrollModal({ show: false })}>Done</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}