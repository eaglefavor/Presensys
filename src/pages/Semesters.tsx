import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Calendar, Archive, Trash2, CheckCircle2, ArrowRight, Clock, BookOpen, LayoutDashboard } from 'lucide-react';
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

  // Fetch course counts for each semester
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
    if (confirm('CRITICAL WARNING: This will permanently delete this semester and ALL associated Courses, Sessions, and Attendance Records.')) {
      await db.transaction('rw', [db.semesters, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords], async () => {
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
    <div className="container-fluid animate-in px-0 min-vh-100">
      {/* Premium Sticky Header */}
      <div className="sticky-top bg-white bg-opacity-95 backdrop-blur border-bottom pb-3 pt-3 px-3 mb-4 shadow-sm z-index-10">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h1 className="fw-black letter-spacing-n1 mb-0 h3 text-primary">ACADEMIC CYCLES</h1>
            <p className="text-muted x-small fw-bold text-uppercase tracking-wider mb-0 text-gold">
              Semester Management
            </p>
          </div>
          <button 
            className="btn btn-primary rounded-pill shadow-lg d-flex align-items-center gap-2 fw-bold px-4 btn-hover-lift" 
            onClick={() => setShowModal(true)}
          >
            <Plus size={18} /> <span className="d-none d-sm-inline">Add Semester</span>
          </button>
        </div>
      </div>

      <div className="px-3 pb-5">
        {/* Statistics Banner */}
        <div className="row g-3 mb-4">
          <div className="col-6">
            <div className="card border-0 bg-primary-subtle text-primary rounded-4 p-3 shadow-sm">
              <div className="d-flex align-items-center gap-2 mb-1">
                <LayoutDashboard size={16} />
                <span className="x-small fw-bold text-uppercase">Active Session</span>
              </div>
              <div className="fw-bold text-truncate">{activeSemester?.name || 'None Set'}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="card border-0 bg-gold-subtle text-gold-emphasis rounded-4 p-3 shadow-sm">
              <div className="d-flex align-items-center gap-2 mb-1">
                <Calendar size={16} />
                <span className="x-small fw-bold text-uppercase">Total Cycles</span>
              </div>
              <div className="fw-bold h5 mb-0">{semesters?.length || 0}</div>
            </div>
          </div>
        </div>

        {/* Semester Grid */}
        <div className="row g-4">
          <AnimatePresence mode="popLayout">
            {semesters?.map((s) => (
              <motion.div 
                key={s.id} 
                className="col-12 col-md-6 col-lg-4"
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className={`semester-card-premium card border-0 shadow-sm rounded-5 overflow-hidden h-100 ${s.isActive ? 'active-ring' : ''}`}>
                  {/* Card Header with Status Accent */}
                  <div className={`p-4 ${s.isActive ? 'bg-primary text-white' : 'bg-white'}`}>
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div className={`status-pill px-3 py-1 rounded-pill x-small fw-bold text-uppercase ${s.isActive ? 'bg-white text-primary' : 'bg-light text-muted'}`}>
                        {s.isActive ? 'Active Now' : s.isArchived ? 'Archived' : 'Inactive'}
                      </div>
                      <div className="d-flex gap-1">
                        <button className={`btn btn-sm rounded-circle p-2 ${s.isActive ? 'btn-white-glass' : 'btn-light'}`} onClick={() => handleArchive(s.id!, s.isArchived)}>
                          <Archive size={16} />
                        </button>
                        <button className={`btn btn-sm rounded-circle p-2 ${s.isActive ? 'btn-white-glass text-white' : 'btn-light text-danger'}`} onClick={() => handleDelete(s.id!)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <h4 className="fw-black mb-0 letter-spacing-n1 text-truncate">{s.name}</h4>
                  </div>

                  <div className="card-body p-4 bg-white">
                    {/* Duration Info */}
                    <div className="d-flex align-items-center gap-3 mb-4">
                      <div className="icon-circle bg-light text-primary">
                        <Clock size={20} />
                      </div>
                      <div>
                        <div className="xx-small text-uppercase fw-bold text-muted tracking-wider">Duration</div>
                        <div className="fw-bold small text-dark">
                          {new Date(s.startDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                          <ArrowRight size={12} className="mx-2 text-gold" />
                          {new Date(s.endDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                        </div>
                      </div>
                    </div>

                    {/* Stats & Quick Action */}
                    <div className="d-flex align-items-center justify-content-between pt-3 border-top border-light">
                      <div className="d-flex align-items-center gap-2">
                        <div className="bg-light p-2 rounded-3 text-muted">
                          <BookOpen size={16} />
                        </div>
                        <div>
                          <div className="xx-small text-uppercase fw-bold text-muted">Courses</div>
                          <div className="fw-black text-primary">{courseCounts?.[s.id!] || 0}</div>
                        </div>
                      </div>
                      
                      {!s.isActive && !s.isArchived && (
                        <button 
                          className="btn btn-gold rounded-pill px-4 py-2 fw-bold shadow-sm d-flex align-items-center gap-2 animate-pulse"
                          onClick={() => handleSetActive(s.id!)}
                        >
                          <CheckCircle2 size={18} /> Activate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {(!semesters || semesters.length === 0) && (
            <div className="col-12 text-center py-5">
              <div className="bg-light d-inline-block p-4 rounded-circle mb-3 shadow-inner">
                <Calendar size={48} className="text-muted opacity-25" />
              </div>
              <h5 className="fw-bold text-muted">No Academic Cycles</h5>
              <p className="text-muted small">Begin by defining your first semester cycle.</p>
            </div>
          )}
        </div>
      </div>

      {/* Premium Modal */}
      {showModal && (
        <>
          <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,46,175,0.2)', backdropFilter: 'blur(10px)' }}>
            <motion.div 
              className="modal-dialog modal-dialog-centered"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <div className="modal-content border-0 shadow-2xl rounded-5 overflow-hidden">
                <div className="modal-header bg-primary text-white border-bottom-0 p-4">
                  <div>
                    <h5 className="fw-black mb-0 letter-spacing-n1">NEW CYCLE</h5>
                    <p className="mb-0 opacity-75 x-small fw-bold text-uppercase tracking-wider">Define Semester Period</p>
                  </div>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
                </div>
                
                <form onSubmit={handleAddSemester}>
                  <div className="modal-body p-4 bg-light">
                    <div className="card border-0 shadow-sm rounded-4 p-3 mb-3">
                      <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">Semester Name</label>
                      <div className="input-group modern-input-unified">
                        <input 
                          type="text" 
                          className="form-control fw-bold h5 mb-0" 
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
                            className="form-control border-0 bg-light rounded-3 fw-bold text-primary" 
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
                            className="form-control border-0 bg-light rounded-3 fw-bold text-primary" 
                            required 
                            value={newSemester.endDate}
                            onChange={e => setNewSemester({...newSemester, endDate: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="modal-footer border-top-0 bg-white p-4">
                    <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary px-5 py-3 rounded-pill shadow-lg fw-black letter-spacing-n1">
                      CREATE CYCLE
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
        .fw-black { font-weight: 900; }
        .text-gold { color: #cfb53b; }
        .bg-gold-subtle { background-color: rgba(207, 181, 59, 0.1); }
        .btn-gold { background: #cfb53b; color: white; }
        .btn-gold:hover { background: #b89b2d; color: white; }
        
        .letter-spacing-n1 { letter-spacing: -1.2px; }
        .xx-small { font-size: 10px; }
        .shadow-inner { box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
        
        .active-ring { ring: 3px solid #0d6efd; box-shadow: 0 0 0 4px rgba(13, 110, 253, 0.2) !important; }
        
        .semester-card-premium {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          background: white;
        }
        .semester-card-premium:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.1) !important;
        }

        .icon-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-white-glass {
          background: rgba(255,255,255,0.2);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
          backdrop-filter: blur(4px);
        }
        .btn-white-glass:hover { background: rgba(255,255,255,0.4); color: white; }

        .animate-pulse {
          animation: pulse-gold 2s infinite;
        }
        @keyframes pulse-gold {
          0% { box-shadow: 0 0 0 0 rgba(207, 181, 59, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(207, 181, 59, 0); }
          100% { box-shadow: 0 0 0 0 rgba(207, 181, 59, 0); }
        }

        .backdrop-blur { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .z-index-10 { z-index: 10; }
      `}</style>
    </div>
  );
}