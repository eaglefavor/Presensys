import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Calendar, Archive, Trash2, CheckCircle2, ArrowRight, BookOpen } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Course counts for context
  const courseCounts = useLiveQuery(async () => {
    const counts: Record<number, number> = {};
    const courses = await db.courses.toArray();
    courses.forEach(c => {
      counts[c.semesterId] = (counts[c.semesterId] || 0) + 1;
    });
    return counts;
  }, []);

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
      await db.semesters.toCollection().modify({ isActive: false });
      await db.semesters.update(id, { isActive: true });
      await refreshActiveSemester();
    });
  };

  const handleArchive = async (id: number, currentStatus: boolean) => {
    if (activeSemester?.id === id && !currentStatus) {
      if (!confirm('This is the currently active semester. Archiving it will remove it from the dashboard. Continue?')) return;
    }
    await db.semesters.update(id, { isArchived: !currentStatus });
    await refreshActiveSemester();
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this cycle and all its data?')) {
      await db.transaction('rw', [db.semesters, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords], async () => {
        const courses = await db.courses.where('semesterId').equals(id).toArray();
        const courseIds = courses.map(c => c.id!);
        if (courseIds.length > 0) {
          const sessions = await db.attendanceSessions.where('courseId').anyOf(courseIds).toArray();
          const sessionIds = sessions.map(s => s.id!);
          if (sessionIds.length > 0) await db.attendanceRecords.where('sessionId').anyOf(sessionIds).delete();
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
    <div className="cycles-page animate-in min-vh-100">
      {/* Auth-Style Hero */}
      <div className="auth-hero text-center py-5 px-4 text-white shadow-lg mb-4">
        <div className="brand-icon-wrapper mb-3 mx-auto shadow-sm">
          <Calendar size={42} className="text-warning" />
        </div>
        <h1 className="fw-black mb-1 letter-spacing-n1 h2 text-uppercase">ACADEMIC CYCLES</h1>
        <p className="opacity-75 x-small fw-bold text-uppercase tracking-widest mb-0">Management Center</p>
      </div>

      <div className="px-3 pb-5 container-mobile">
        {/* Quick Summary / Status */}
        <div className="mb-4 d-flex justify-content-between align-items-center px-1">
          <div>
            <h6 className="fw-black text-primary mb-0">ALL CYCLES</h6>
            <p className="text-muted xx-small fw-bold text-uppercase tracking-wider mb-0">History & Schedule</p>
          </div>
          <button 
            className="btn btn-primary-unified rounded-pill py-2 px-4 shadow-lg fw-bold d-flex align-items-center gap-2"
            onClick={() => setShowModal(true)}
          >
            <Plus size={18} /> New Cycle
          </button>
        </div>

        {/* Simplistic List */}
        <div className="d-flex flex-column gap-3">
          <AnimatePresence mode="popLayout">
            {semesters?.map((s) => (
              <motion.div 
                key={s.id} 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className={`cycle-card card border-0 shadow-sm rounded-4 overflow-hidden ${s.isActive ? 'active-border' : ''}`}>
                  <div className="card-body p-3 d-flex align-items-center gap-3">
                    {/* Status Indicator Icon */}
                    <div className={`icon-box-small rounded-3 ${s.isActive ? 'bg-primary text-white shadow-blue' : 'bg-light text-muted'}`}>
                      {s.isActive ? <CheckCircle2 size={20} /> : <Calendar size={20} />}
                    </div>

                    <div className="flex-grow-1 overflow-hidden">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <h6 className="fw-bold mb-0 text-dark text-truncate">{s.name}</h6>
                        {s.isArchived && <span className="badge bg-warning-subtle text-warning-emphasis xx-small fw-bold border border-warning-subtle">ARCHIVED</span>}
                      </div>
                      <div className="text-muted xx-small fw-bold text-uppercase d-flex align-items-center gap-1">
                        {new Date(s.startDate).getFullYear()} <ArrowRight size={8} /> {new Date(s.endDate).getFullYear()}
                        <span className="mx-1">•</span>
                        <BookOpen size={10} className="text-primary" /> {courseCounts?.[s.id!] || 0} Courses
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="d-flex gap-1">
                      {!s.isActive && !s.isArchived && (
                        <button className="btn btn-light-gold btn-sm rounded-pill px-3 fw-bold xx-small" onClick={() => handleSetActive(s.id!)}>
                          ACTIVATE
                        </button>
                      )}
                      <button className="btn btn-link-muted p-2" onClick={() => handleArchive(s.id!, s.isArchived)}>
                        <Archive size={18} />
                      </button>
                      <button className="btn btn-link-danger p-2" onClick={() => handleDelete(s.id!)}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {(!semesters || semesters.length === 0) && (
            <div className="text-center py-5 bg-white rounded-5 shadow-sm border border-dashed">
              <Calendar size={48} className="text-muted opacity-25 mb-3" />
              <h6 className="fw-bold text-muted">No cycles defined yet</h6>
              <p className="xx-small text-uppercase fw-bold tracking-widest text-muted">Get started by creating a new academic period</p>
            </div>
          )}
        </div>
      </div>

      {/* Auth-Style Modal */}
      {showModal && (
        <>
          <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
            <motion.div 
              className="modal-dialog modal-dialog-centered px-3"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <div className="modal-content border-0 shadow-2xl rounded-5 overflow-hidden">
                <div className="modal-header border-0 bg-white pb-0 pt-4 px-4">
                  <h5 className="fw-black mb-0 letter-spacing-n1 text-primary">NEW CYCLE</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                </div>
                
                <form onSubmit={handleAddSemester}>
                  <div className="modal-body p-4 bg-white">
                    <div className="mb-3">
                      <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">Semester Title</label>
                      <div className="input-group modern-input-unified">
                        <input 
                          type="text" className="form-control" placeholder="e.g. 2025/2026 First Semester"
                          required value={newSemester.name}
                          onChange={e => setNewSemester({...newSemester, name: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="row g-3">
                      <div className="col-6">
                        <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">Start Date</label>
                        <div className="input-group modern-input-unified">
                          <input 
                            type="date" className="form-control"
                            required value={newSemester.startDate}
                            onChange={e => setNewSemester({...newSemester, startDate: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="col-6">
                        <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">End Date</label>
                        <div className="input-group modern-input-unified">
                          <input 
                            type="date" className="form-control"
                            required value={newSemester.endDate}
                            onChange={e => setNewSemester({...newSemester, endDate: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="modal-footer border-0 p-4 pt-0 bg-white">
                    <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary-unified flex-grow-1 py-3 rounded-4 shadow-lg fw-black letter-spacing-n1">
                      CREATE SESSION
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      <style>{`
        .cycles-page { background-color: #fcfcfd; }
        .auth-hero {
          background: linear-gradient(135deg, #0d6efd 0%, #0046af 100%);
          border-bottom-left-radius: 40px !important;
          border-bottom-right-radius: 40px !important;
        }
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .x-small { font-size: 11px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 3px; }
        .text-gold { color: #cfb53b; }
        
        .brand-icon-wrapper {
          width: 76px;
          height: 76px;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(8px);
          border-radius: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.2);
        }

        .cycle-card {
          transition: all 0.2s ease;
          background: #fff;
        }
        .cycle-card:active { transform: scale(0.98); }
        .active-border { border-left: 4px solid #cfb53b !important; }

        .icon-box-small {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .shadow-blue { box-shadow: 0 4px 12px rgba(13, 110, 253, 0.2); }

        .btn-primary-unified {
          background: linear-gradient(135deg, #0d6efd 0%, #0056b3 100%);
          border: none;
          color: #fff;
        }
        
        .btn-light-gold {
          background: rgba(207, 181, 59, 0.1);
          color: #b89b2d;
          border: 1px solid rgba(207, 181, 59, 0.2);
        }

        .btn-link-muted { color: #adb5bd; border: none; background: transparent; }
        .btn-link-muted:hover { color: #6c757d; }
        .btn-link-danger { color: #ffccd5; border: none; background: transparent; }
        .btn-link-danger:hover { color: #dc3545; }

        .modern-input-unified {
          background: #f8f9fa;
          border-radius: 14px;
          overflow: hidden;
          border: 1.5px solid transparent;
          transition: all 0.2s ease;
        }
        .modern-input-unified:focus-within {
          border-color: #0d6efd;
          background: #fff;
          box-shadow: 0 8px 20px rgba(13,110,253,0.06);
        }
        .modern-input-unified .form-control {
          background: transparent;
          border: none;
          padding: 0.9rem 1rem;
          font-weight: 600;
          font-size: 14px;
        }
        .modern-input-unified .form-control:focus { box-shadow: none; }
      `}</style>
    </div>
  );
}
