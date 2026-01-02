import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Calendar, Archive, Trash2, CheckCircle2, ArrowRight, Clock } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';

export default function Semesters() {
  const semesters = useLiveQuery(() => db.semesters.orderBy('startDate').reverse().toArray());
  const activeSemester = useAppStore(state => state.activeSemester);
  const refreshActiveSemester = useAppStore(state => state.refreshActiveSemester);
  
  const [showModal, setShowModal] = useState(false);
  const [newSemester, setNewSemester] = useState({
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 4)).toISOString().split('T')[0],
  });

  const handleAddSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newSemester.startDate > newSemester.endDate) {
      alert('Start date cannot be after end date.');
      return;
    }

    const id = await db.semesters.add({
      ...newSemester,
      isActive: false,
      isArchived: false,
    });
    
    // If it's the first semester, make it active
    if (semesters && semesters.length === 0) {
      await handleSetActive(id as number);
    }
    
    setShowModal(false);
    setNewSemester({
      name: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 4)).toISOString().split('T')[0],
    });
  };

  const handleSetActive = async (id: number) => {
    await db.transaction('rw', db.semesters, async () => {
      // Deactivate all
      await db.semesters.toCollection().modify({ isActive: false });
      // Activate selected
      await db.semesters.update(id, { isActive: true });
      
      await refreshActiveSemester();
    });
  };

  const handleArchive = async (id: number, currentStatus: boolean) => {
    // If archiving the active semester, warn user
    if (activeSemester?.id === id && !currentStatus) {
      if (!confirm('This is the currently active semester. Archiving it will remove it from the dashboard. Continue?')) return;
    }
    await db.semesters.update(id, { isArchived: !currentStatus });
    await refreshActiveSemester();
  };

  const handleDelete = async (id: number) => {
    if (confirm('CRITICAL WARNING: This will permanently delete this semester and ALL associated Courses, Sessions, and Attendance Records. This cannot be undone.')) {
      await db.transaction('rw', [db.semesters, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords], async () => {
        // ... (delete logic) ...
        const courses = await db.courses.where('semesterId').equals(id).toArray();
        const courseIds = courses.map(c => c.id!);
        const sessions = await db.attendanceSessions.where('courseId').anyOf(courseIds).toArray();
        const sessionIds = sessions.map(s => s.id!);

        if (sessionIds.length > 0) {
          await db.attendanceRecords.where('sessionId').anyOf(sessionIds).delete();
        }

        if (courseIds.length > 0) {
          await db.attendanceSessions.where('courseId').anyOf(courseIds).delete();
          await db.enrollments.where('courseId').anyOf(courseIds).delete();
          await db.courses.bulkDelete(courseIds);
        }

        await db.semesters.delete(id);
        await refreshActiveSemester();
      });
    }
  };

  return (
    <div className="container-fluid animate-in px-0">
      {/* Premium Header */}
      <div className="sticky-top bg-white bg-opacity-95 backdrop-blur border-bottom pb-3 pt-3 px-3 mb-4 shadow-sm z-index-10">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h1 className="fw-black letter-spacing-n1 mb-0 h3 text-primary">SEMESTERS</h1>
            <p className="text-muted x-small fw-bold text-uppercase tracking-wider mb-0 text-gold">
              Academic Calendar
            </p>
          </div>
          <button 
            className="btn btn-primary rounded-pill shadow-lg d-flex align-items-center gap-2 fw-bold px-4 btn-hover-lift" 
            onClick={() => setShowModal(true)}
          >
            <Plus size={18} /> <span className="d-none d-sm-inline">New Session</span>
          </button>
        </div>
      </div>

      <div className="px-3 pb-5">
        <div className="row g-4">
          {semesters?.map((s) => (
            <div key={s.id} className="col-12 col-md-6 col-lg-4">
              <div className={`semester-card card border-0 shadow-sm rounded-4 h-100 overflow-hidden ${s.isActive ? 'ring-2-primary' : ''}`}>
                <div className={`card-header border-0 py-3 px-4 d-flex justify-content-between align-items-center ${s.isActive ? 'bg-primary text-white' : 'bg-white'}`}>
                  <h5 className="fw-bold mb-0 text-truncate">{s.name}</h5>
                  {s.isActive && <CheckCircle2 size={20} className="text-warning" />}
                </div>
                
                <div className="card-body p-4">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <div className="icon-square bg-light text-primary rounded-3 p-3">
                      <Calendar size={24} />
                    </div>
                    <div>
                      <div className="x-small text-uppercase fw-bold text-muted">Duration</div>
                      <div className="fw-medium small">
                        {new Date(s.startDate).toLocaleDateString()} <ArrowRight size={12} className="mx-1 text-muted" /> {new Date(s.endDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="d-flex gap-2 mt-auto">
                    {!s.isActive && !s.isArchived && (
                      <button 
                        className="btn btn-outline-primary btn-sm flex-grow-1 fw-bold rounded-pill"
                        onClick={() => handleSetActive(s.id!)}
                      >
                        Set Active
                      </button>
                    )}
                    <button 
                      className={`btn btn-sm rounded-pill px-3 ${s.isArchived ? 'btn-warning text-dark' : 'btn-light text-muted'}`}
                      onClick={() => handleArchive(s.id!, s.isArchived)}
                      title={s.isArchived ? "Unarchive" : "Archive"}
                    >
                      <Archive size={18} />
                    </button>
                    <button 
                      className="btn btn-light btn-sm text-danger rounded-pill px-3 ms-auto"
                      onClick={() => handleDelete(s.id!)}
                      title="Delete Semester"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                {s.isArchived && (
                  <div className="card-footer bg-warning-subtle border-0 py-2 text-center">
                    <small className="fw-bold text-warning-emphasis d-flex align-items-center justify-content-center gap-2">
                      <Clock size={14} /> Archived (Read Only)
                    </small>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {(!semesters || semesters.length === 0) && (
            <div className="col-12 text-center py-5">
              <div className="bg-light d-inline-block p-4 rounded-circle mb-3">
                <Calendar size={48} className="text-muted opacity-25" />
              </div>
              <h5 className="fw-bold text-muted">No Semesters Yet</h5>
              <p className="text-muted small">Create a new semester to start tracking attendance.</p>
            </div>
          )}
        </div>
      </div>

      {/* Premium Modal */}
      {showModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)' }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-2xl rounded-5 overflow-hidden">
                <div className="modal-header bg-primary text-white border-bottom-0 p-4">
                  <div>
                    <h5 className="fw-black mb-0 letter-spacing-n1">NEW ACADEMIC SESSION</h5>
                    <p className="mb-0 opacity-75 x-small fw-bold text-uppercase tracking-wider">Create Semester</p>
                  </div>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
                </div>
                
                <form onSubmit={handleAddSemester}>
                  <div className="modal-body p-4 bg-light">
                    <div className="card border-0 shadow-sm rounded-4 p-3 mb-3">
                      <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">Semester Title</label>
                      <div className="input-group modern-input-unified">
                        <input 
                          type="text" 
                          className="form-control fw-bold" 
                          required 
                          value={newSemester.name}
                          onChange={e => setNewSemester({...newSemester, name: e.target.value})}
                          placeholder="e.g. 2025/2026 First Semester"
                        />
                      </div>
                    </div>

                    <div className="row g-3">
                      <div className="col-6">
                        <div className="card border-0 shadow-sm rounded-4 p-3 h-100">
                          <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">Start Date</label>
                          <input 
                            type="date" 
                            className="form-control border-0 bg-light rounded-3 fw-medium" 
                            required 
                            value={newSemester.startDate}
                            onChange={e => setNewSemester({...newSemester, startDate: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="card border-0 shadow-sm rounded-4 p-3 h-100">
                          <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">End Date</label>
                          <input 
                            type="date" 
                            className="form-control border-0 bg-light rounded-3 fw-medium" 
                            required 
                            value={newSemester.endDate}
                            onChange={e => setNewSemester({...newSemester, endDate: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="modal-footer border-top-0 bg-white p-4">
                    <button type="button" className="btn btn-link text-muted text-decoration-none fw-medium" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary px-5 rounded-pill shadow fw-bold">
                      Create Session
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      <style>{`
        .fw-black { font-weight: 900; }
        .text-gold { color: #cfb53b; }
        .ring-2-primary { box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.3) !important; }
        
        .semester-card {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .semester-card:hover {
          transform: translateY(-5px);
        }

        .icon-square {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modern-input-unified {
          background: #fff;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #dee2e6;
        }
        .modern-input-unified:focus-within {
          border-color: #0d6efd;
          box-shadow: 0 0 0 4px rgba(13,110,253,0.1);
        }
        .modern-input-unified .form-control { border: none; padding: 0.75rem 1rem; }
        .modern-input-unified .form-control:focus { box-shadow: none; }
      `}</style>
    </div>
  );
}
