import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Calendar, CheckCircle2, ArrowRight, BookOpen, Clock, ChevronRight, Globe, LayoutDashboard } from 'lucide-react';
import { db, type Semester } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function Semesters() {
  const semesters = useLiveQuery(() => db.semesters.orderBy('startDate').reverse().toArray());
  const activeSemester = useAppStore(state => state.activeSemester);
  const refreshActiveSemester = useAppStore(state => state.refreshActiveSemester);
  
  const [showModal, setShowModal] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);
  const [newSemester, setNewSemester] = useState({
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 4)).toISOString().split('T')[0],
  });

  const courseCounts = useLiveQuery(async () => {
    const counts: Record<number, number> = {};
    const courses = await db.courses.toArray();
    courses.forEach(c => { counts[c.semesterId] = (counts[c.semesterId] || 0) + 1; });
    return counts;
  }, []);

  const handleAddSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSemester.startDate > newSemester.endDate) { alert('Start date cannot be after end date.'); return; }
    const id = await db.semesters.add({ ...newSemester, isActive: false, isArchived: false });
    if (semesters && semesters.length === 0) await handleSetActive(id as number);
    setShowModal(false);
    setNewSemester({ name: '', startDate: new Date().toISOString().split('T')[0], endDate: new Date(new Date().setMonth(new Date().getMonth() + 4)).toISOString().split('T')[0] });
  };

  const handleSetActive = async (id: number) => {
    await db.transaction('rw', db.semesters, async () => {
      await db.semesters.toCollection().modify({ isActive: false });
      await db.semesters.update(id, { isActive: true });
      await refreshActiveSemester();
    });
    setSelectedSemester(null);
  };

  const handleArchive = async (id: number, currentStatus: boolean) => {
    if (activeSemester?.id === id && !currentStatus) {
      if (!confirm('This is the currently active semester. Archiving it will remove it from the dashboard. Continue?')) return;
    }
    await db.semesters.update(id, { isArchived: !currentStatus });
    await refreshActiveSemester();
    setSelectedSemester(null);
  };

  const handleDelete = async (id: number) => {
    if (confirm('CRITICAL: Delete this cycle and all its data?')) {
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
      setSelectedSemester(null);
    }
  };

  return (
    <div className="cycles-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Simplistic White Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div>
            <h1 className="h4 fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>ACADEMIC CYCLES</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Management History</p>
          </div>
          <button 
            className="btn btn-primary rounded-circle p-3 shadow-lg d-flex align-items-center justify-content-center" 
            onClick={() => setShowModal(true)}
            style={{ width: '52px', height: '52px' }}
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="px-4 container-mobile">
        {/* Active Status Banner */}
        {activeSemester && (
          <div className="card border-0 mb-4 bg-white p-3 d-flex flex-row align-items-center gap-3">
            <div className="rounded-circle d-flex align-items-center justify-content-center bg-primary bg-opacity-10" style={{ width: '40px', height: '40px' }}>
              <CheckCircle2 size={20} className="text-primary" />
            </div>
            <div>
              <div className="xx-small fw-bold text-muted text-uppercase">Currently Active</div>
              <div className="small fw-black text-dark">{activeSemester.name}</div>
            </div>
          </div>
        )}

        <div className="d-flex flex-column gap-3">
          <AnimatePresence mode="popLayout">
            {semesters?.map((s) => (
              <motion.div 
                key={s.id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} 
                className="card border-0 bg-white cursor-pointer" 
                onClick={() => setSelectedSemester(s)}
              >
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className={`icon-box-small rounded-2 d-flex align-items-center justify-content-center ${s.isActive ? 'bg-primary text-white' : 'bg-light text-muted'}`} style={{ width: '44px', height: '44px' }}>
                    {s.isActive ? <LayoutDashboard size={20} /> : <Calendar size={20} />}
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="d-flex align-items-center gap-2">
                      <h6 className="fw-bold mb-0 text-dark text-truncate">{s.name}</h6>
                      {s.isArchived && <span className="badge bg-light text-muted border xx-small fw-bold">ARCHIVED</span>}
                    </div>
                    <div className="xx-small fw-bold text-uppercase text-muted d-flex align-items-center gap-1 mt-1">
                      {new Date(s.startDate).getFullYear()} <ArrowRight size={10} /> {new Date(s.endDate).getFullYear()}
                      <span className="mx-1">•</span>
                      <BookOpen size={10} className="text-primary" /> {courseCounts?.[s.id!] || 0} Courses
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-muted opacity-50" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Details Popup (Simplistic White Style) */}
      <AnimatePresence>
        {selectedSemester && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 2000 }} onClick={() => setSelectedSemester(null)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="modal fade show d-block" style={{ zIndex: 2001, top: 'auto', bottom: 0 }}>
              <div className="modal-dialog modal-dialog-centered m-0" style={{ maxWidth: 'none' }}>
                <div className="modal-content border-0 shadow-2xl rounded-top-5 overflow-hidden pb-5">
                  <div className="modal-header border-0 bg-white pb-0 pt-4 px-4">
                    <div className="mx-auto bg-light rounded-pill mb-2" style={{ width: '40px', height: '4px' }}></div>
                  </div>
                  <div className="modal-body px-4">
                    <div className="text-center mb-4">
                      <h4 className="fw-black mb-1" style={{ color: 'var(--primary-blue)' }}>{selectedSemester.name}</h4>
                      <div className="d-flex justify-content-center gap-2 mb-2">
                        {selectedSemester.isActive && <span className="badge bg-primary rounded-pill xx-small">ACTIVE</span>}
                        {selectedSemester.isArchived && <span className="badge bg-light text-muted border rounded-pill xx-small">ARCHIVED</span>}
                      </div>
                    </div>

                    <div className="card bg-light border-0 rounded-3 p-3 mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom">
                        <Globe size={18} className="text-primary" />
                        <div><div className="xx-small fw-bold text-muted uppercase">Starts</div><div className="fw-bold small">{new Date(selectedSemester.startDate).toLocaleDateString(undefined, {dateStyle: 'long'})}</div></div>
                      </div>
                      <div className="d-flex align-items-center gap-3">
                        <Clock size={18} className="text-primary" />
                        <div><div className="xx-small fw-bold text-muted uppercase">Ends</div><div className="fw-bold small">{new Date(selectedSemester.endDate).toLocaleDateString(undefined, {dateStyle: 'long'})}</div></div>
                      </div>
                    </div>

                    <div className="d-flex flex-column gap-2 mb-4">
                      {!selectedSemester.isActive && !selectedSemester.isArchived && (
                        <button className="btn btn-primary w-100 py-3 rounded-3 fw-bold" onClick={() => handleSetActive(selectedSemester.id!)}>Set as Active</button>
                      )}
                      <button className="btn btn-light w-100 py-3 rounded-3 fw-bold border" onClick={() => handleArchive(selectedSemester.id!, selectedSemester.isArchived)}>
                        {selectedSemester.isArchived ? 'Restore from Archive' : 'Archive Semester'}
                      </button>
                      <button className="btn btn-link text-danger fw-bold xx-small text-decoration-none py-2" onClick={() => handleDelete(selectedSemester.id!)}>Delete Permanently</button>
                    </div>
                    
                    <button className="btn btn-light w-100 py-2 rounded-3 text-muted fw-bold small" onClick={() => setSelectedSemester(null)}>Close</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New Cycle Modal (Simplistic) */}
      {showModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1050 }}>
          <motion.div className="modal-dialog modal-dialog-centered px-3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-content border-0 shadow-2xl rounded-4">
              <div className="modal-header border-bottom-0 p-4 pb-0">
                <h5 className="fw-black mb-0 h5" style={{ color: 'var(--primary-blue)' }}>NEW ACADEMIC CYCLE</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <form onSubmit={handleAddSemester}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="xx-small fw-bold text-muted ps-1 mb-1">CYCLE TITLE</label>
                    <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold" placeholder="e.g. 2025/2026 First Semester" required value={newSemester.name} onChange={e => setNewSemester({...newSemester, name: e.target.value})} /></div>
                  </div>
                  <div className="row g-3">
                    <div className="col-6"><label className="xx-small fw-bold text-muted ps-1 mb-1">START DATE</label><div className="modern-input-unified p-1"><input type="date" className="form-control border-0 bg-transparent small fw-bold" required value={newSemester.startDate} onChange={e => setNewSemester({...newSemester, startDate: e.target.value})} /></div></div>
                    <div className="col-6"><label className="xx-small fw-bold text-muted ps-1 mb-1">END DATE</label><div className="modern-input-unified p-1"><input type="date" className="form-control border-0 bg-transparent small fw-bold" required value={newSemester.endDate} onChange={e => setNewSemester({...newSemester, endDate: e.target.value})} /></div></div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 pt-0">
                  <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold small" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary flex-grow-1 py-3 rounded-3 shadow-sm fw-bold">CREATE CYCLE</button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
        .rounded-top-5 { border-top-left-radius: 32px !important; border-top-right-radius: 32px !important; }
        .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
      `}</style>
    </div>
  );
}
