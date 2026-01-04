import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Calendar, ArrowRight, BookOpen, LayoutDashboard, ChevronRight, Clock, Globe, } from 'lucide-react';
import { db, type Semester } from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function Semesters() {
  const { user } = useAuthStore();
  const semesters = useLiveQuery(() => db.semesters.orderBy('startDate').reverse().toArray());
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
    if (!user) return;
    if (newSemester.startDate > newSemester.endDate) { alert('Start date cannot be after end date.'); return; }
    await db.semesters.add({ ...newSemester, isActive: false, isArchived: false, synced: 0, userId: user.id });
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
    await db.semesters.update(id, { isArchived: !currentStatus });
    await refreshActiveSemester();
    setSelectedSemester(null);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this cycle and all its data?')) {
      await db.transaction('rw', [db.semesters, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords], async () => {
        const courses = await db.courses.where('semesterId').equals(id).toArray();
        const courseIds = courses.map(c => c.id!);
        
        if (courseIds.length > 0) {
          const sessions = await db.attendanceSessions.where('courseId').anyOf(courseIds).toArray();
          const sessionIds = sessions.map(s => s.id!);
          
          if (sessionIds.length > 0) {
            // Mark attendance records as deleted
            await db.attendanceRecords.where('sessionId').anyOf(sessionIds).modify({ isDeleted: 1, synced: 0 });
          }
          // Mark attendance sessions as deleted
          await db.attendanceSessions.where('courseId').anyOf(courseIds).modify({ isDeleted: 1, synced: 0 });
          // Mark enrollments as deleted
          await db.enrollments.where('courseId').anyOf(courseIds).modify({ isDeleted: 1, synced: 0 });
          // Mark courses as deleted
          await db.courses.where('semesterId').equals(id).modify({ isDeleted: 1, synced: 0 });
        }
        
        // Mark semester as deleted
        await db.semesters.update(id, { isDeleted: 1, synced: 0 });
        await refreshActiveSemester();
      });
      setSelectedSemester(null);
    }
  };

  return (
    <div className="cycles-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h1 className="h4 fw-black mb-0 uppercase" style={{ color: 'var(--primary-blue)' }}>ACADEMIC CYCLES</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Cycle Management</p>
          </div>
          <button 
            className="btn btn-primary rounded-circle p-0 shadow-lg d-flex align-items-center justify-content-center" 
            onClick={() => setShowModal(true)} 
            style={{ width: '52px', height: '52px' }}
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="px-4 container-mobile">
        <div className="d-flex flex-column gap-2">
          <AnimatePresence mode="popLayout">
            {semesters?.map((s) => (
              <motion.div key={s.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card border-0 bg-white cursor-pointer shadow-sm" onClick={() => setSelectedSemester(s)}>
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className={`icon-box-small rounded-2 d-flex align-items-center justify-content-center ${s.isActive ? 'bg-primary text-white' : 'bg-light text-muted'}`} style={{ width: '44px', height: '44px' }}>
                    {s.isActive ? <LayoutDashboard size={20} /> : <Calendar size={20} />}
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-0 text-dark text-truncate uppercase">{s.name}</h6>
                    <div className="xx-small fw-bold text-muted text-uppercase d-flex align-items-center gap-1">
                      {new Date(s.startDate).getFullYear()} <ArrowRight size={10} /> {new Date(s.endDate).getFullYear()}
                      <span className="mx-1">•</span>
                      <BookOpen size={10} className="text-primary" /> {courseCounts?.[s.id!] || 0} Courses
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted opacity-50" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {selectedSemester && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 2000 }} onClick={() => setSelectedSemester(null)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="modal fade show d-block" style={{ zIndex: 2001, top: 'auto', bottom: 0 }}>
              <div className="modal-dialog modal-dialog-centered m-0" style={{ maxWidth: 'none' }}>
                <div className="modal-content border-0 shadow-2xl rounded-top-5 pb-5">
                  <div className="modal-header border-0 bg-white pb-0 pt-4 px-4"><div className="mx-auto bg-light rounded-pill" style={{ width: '40px', height: '4px' }}></div></div>
                  <div className="modal-body px-4 text-center">
                    <h4 className="fw-black mb-1 text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>{selectedSemester.name}</h4>
                    <div className="d-flex justify-content-center gap-2 mb-4">
                      {selectedSemester.isActive && <span className="badge bg-primary rounded-pill xx-small">ACTIVE</span>}
                      {selectedSemester.isArchived && <span className="badge bg-light text-muted border rounded-pill xx-small">ARCHIVED</span>}
                    </div>
                    <div className="card bg-light border-0 rounded-3 p-3 mb-4 text-start">
                      <div className="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom"><Globe size={18} className="text-primary" /><div><div className="xx-small fw-bold text-muted uppercase">Starts</div><div className="fw-bold small">{new Date(selectedSemester.startDate).toLocaleDateString(undefined, {dateStyle: 'long'})}</div></div></div>
                      <div className="d-flex align-items-center gap-3"><Clock size={18} className="text-primary" /><div><div className="xx-small fw-bold text-muted uppercase">Ends</div><div className="fw-bold small">{new Date(selectedSemester.endDate).toLocaleDateString(undefined, {dateStyle: 'long'})}</div></div></div>
                    </div>
                    <div className="d-flex flex-column gap-2 mb-4">
                      {!selectedSemester.isActive && !selectedSemester.isArchived && <button className="btn btn-primary w-100 py-3 rounded-3 fw-bold shadow-sm" onClick={() => handleSetActive(selectedSemester.id!)}>Set as Active</button>}
                      <button className="btn btn-light w-100 py-3 rounded-3 fw-bold border shadow-sm" onClick={() => handleArchive(selectedSemester.id!, selectedSemester.isArchived)}>{selectedSemester.isArchived ? 'Restore' : 'Archive Semester'}</button>
                      <button className="btn btn-link text-danger fw-bold xx-small text-decoration-none py-2" onClick={() => handleDelete(selectedSemester.id!)}>Delete Record</button>
                    </div>
                    <button className="btn btn-light w-100 py-2 rounded-3 text-muted fw-bold small" onClick={() => setSelectedSemester(null)}>Close</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1050 }}>
          <motion.div className="modal-dialog modal-dialog-centered px-3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden">
              <div className="modal-header border-bottom-0 p-4 pb-0"><h5 className="fw-black mb-0 text-primary uppercase letter-spacing-n1">NEW CYCLE</h5><button type="button" className="btn-close" onClick={() => setShowModal(false)}></button></div>
              <form onSubmit={handleAddSemester}>
                <div className="modal-body p-4">
                  <div className="mb-3"><label className="xx-small fw-bold text-muted ps-1">CYCLE TITLE</label><div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold" placeholder="e.g. 2025/2026 First Semester" required value={newSemester.name} onChange={e => setNewSemester({...newSemester, name: e.target.value})} /></div></div>
                  <div className="row g-3"><div className="col-6"><label className="xx-small fw-bold text-muted ps-1">START DATE</label><div className="modern-input-unified p-1"><input type="date" className="form-control border-0 bg-transparent small fw-bold" required value={newSemester.startDate} onChange={e => setNewSemester({...newSemester, startDate: e.target.value})} /></div></div><div className="col-6"><label className="xx-small fw-bold text-muted ps-1">END DATE</label><div className="modern-input-unified p-1"><input type="date" className="form-control border-0 bg-transparent small fw-bold" required value={newSemester.endDate} onChange={e => setNewSemester({...newSemester, endDate: e.target.value})} /></div></div></div>
                </div>
                <div className="modal-footer border-0 p-4 pt-0"><button type="button" className="btn btn-link text-muted text-decoration-none fw-bold small" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary flex-grow-1 py-3 rounded-3 shadow-sm fw-bold">CREATE CYCLE</button></div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .xx-small { font-size: 10px; }
        .rounded-top-5 { border-top-left-radius: 32px !important; border-top-right-radius: 32px !important; }
        .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
      `}</style>
    </div>
  );
}