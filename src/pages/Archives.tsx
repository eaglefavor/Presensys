import { useState } from 'react';
import { Search, User, Download, Archive, History } from 'lucide-react';
import { db } from '../db/db';
import { motion, AnimatePresence } from 'framer-motion';

export default function Archives() {
  const [searchReg, setSearchReg] = useState('');
  const [studentResult, setStudentResult] = useState<any>(null);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination for timeline
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(studentAttendance.length / itemsPerPage);
  const displayedRecords = studentAttendance.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchReg.trim()) return;
    setLoading(true);
    setPage(1);

    const student = await db.students.where('regNumber').equals(searchReg.trim()).first();
    if (!student) {
      setStudentResult(null);
      alert('Student not found in database.');
      setLoading(false);
      return;
    }

    setStudentResult(student);
    const records = await db.attendanceRecords.where('studentId').equals(student.id!).toArray();
    const detailedRecords = [];
    for (const record of records) {
      const session = await db.attendanceSessions.get(record.sessionId);
      if (session) {
        const course = await db.courses.get(session.courseId);
        const semester = await db.semesters.get(course?.semesterId || -1);
        detailedRecords.push({ ...record, session, course, semester });
      }
    }
    detailedRecords.sort((a, b) => new Date(b.session.date).getTime() - new Date(a.session.date).getTime());
    setStudentAttendance(detailedRecords);
    setLoading(false);
  };

  return (
    <div className="archives-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Simplistic Header with Search */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm sticky-top" style={{ zIndex: 100 }}>
        <h1 className="h4 fw-black mb-1 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>DATA ARCHIVES</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-4">Institutional Search Engine</p>
        
        <form onSubmit={handleSearch}>
          <div className="modern-input-unified p-1 d-flex align-items-center bg-light shadow-inner">
            <Search size={20} className="text-muted ms-3" />
            <input 
              type="text" className="form-control border-0 bg-transparent py-3 fw-bold font-monospace letter-spacing-1" 
              placeholder="Enter 10-digit Reg Number..." 
              value={searchReg} onChange={e => setSearchReg(e.target.value)} 
            />
            <button className="btn btn-primary rounded-3 px-4 fw-black xx-small me-1 py-2 shadow-sm" type="submit" disabled={loading}>
              {loading ? '...' : 'SEARCH'}
            </button>
          </div>
        </form>
      </div>

      <div className="px-4 container-mobile">
        <AnimatePresence mode="wait">
          {studentResult ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="results">
              {/* Profile Overview Card */}
              <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4 text-center overflow-hidden position-relative border-left-blue">
                <div className="position-absolute top-0 end-0 p-3 opacity-5"><User size={100} /></div>
                <div className="avatar-circle-lg mx-auto mb-3 bg-primary bg-opacity-10 text-primary fw-black h2 shadow-sm d-flex align-items-center justify-content-center" style={{ width: '80px', height: '80px', borderRadius: '24px' }}>
                  {studentResult.name[0]}
                </div>
                <h4 className="fw-black mb-1 text-dark uppercase letter-spacing-n1 text-uppercase">{studentResult.name}</h4>
                <p className="xx-small fw-black text-muted tracking-widest mb-4 font-monospace">{studentResult.regNumber}</p>
                
                <div className="row g-2">
                  <div className="col-6">
                    <div className="bg-light p-3 rounded-3 border">
                      <div className="xx-small fw-bold text-muted uppercase mb-1">Total Classes</div>
                      <div className="h4 mb-0 fw-black text-dark">{studentAttendance.length}</div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="bg-light p-3 rounded-3 border">
                      <div className="xx-small fw-bold text-muted uppercase mb-1">Present</div>
                      <div className="h4 mb-0 fw-black text-success">{studentAttendance.filter(r => r.status === 'present').length}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Feed */}
              <div className="d-flex justify-content-between align-items-center mb-3 px-1">
                <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">Attendance Timeline</h6>
                {studentAttendance.length > 0 && <span className="badge bg-light text-muted border xx-small fw-black">{studentAttendance.length} RECORDS</span>}
              </div>

              <div className="d-flex flex-column gap-2">
                {displayedRecords.map((record, idx) => (
                  <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4 transition-all">
                    <div className="d-flex align-items-center gap-3">
                      <div className={`p-2 rounded-2 ${record.status === 'present' ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {record.status === 'present' ? <History size={20} /> : <Archive size={20} />}
                      </div>
                      <div className="flex-grow-1 overflow-hidden text-start">
                        <div className="d-flex justify-content-between align-items-start">
                          <h6 className="fw-black mb-0 text-dark small uppercase letter-spacing-n1">{record.course?.code}</h6>
                          <span className="xx-small fw-black text-muted text-uppercase">{new Date(record.session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <p className="xx-small fw-bold text-muted mb-0 text-truncate text-uppercase">{record.course?.title}</p>
                      </div>
                      <div className="text-end ps-2">
                        <span className={`badge rounded-pill xx-small fw-black px-3 ${record.status === 'present' ? 'bg-success text-white shadow-sm' : record.status === 'absent' ? 'bg-danger text-white shadow-sm' : 'bg-warning text-dark shadow-sm'}`}>
                          {record.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Timeline Pagination */}
                {studentAttendance.length > itemsPerPage && (
                  <div className="d-flex justify-content-between align-items-center mt-4">
                    <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={page === 1} onClick={() => setPage(p => Math.max(p - 1, 1))}>PREV</button>
                    <span className="xx-small fw-black text-muted uppercase">Page {page} of {totalPages}</span>
                    <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={page === totalPages} onClick={() => setPage(p => Math.min(p + 1, totalPages))}>NEXT</button>
                  </div>
                )}

                {studentAttendance.length === 0 && (
                  <div className="text-center py-5 bg-white rounded-4 border-dashed">
                    <p className="xx-small fw-bold text-muted uppercase mb-0">No history found for this student</p>
                  </div>
                )}
              </div>
              
              <button className="btn btn-primary w-100 py-3 rounded-4 mt-4 shadow-lg fw-black letter-spacing-n1 d-flex align-items-center justify-content-center gap-2">
                <Download size={18} /> EXPORT TRANSCRIPT (PDF)
              </button>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="empty" className="text-center py-5 mt-5">
              <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><Search size={48} className="text-muted opacity-25" /></div>
              <h5 className="fw-black text-muted text-uppercase tracking-widest">Awaiting Input</h5>
              <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Search by Registration Number to view history</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1.2px; }
        .letter-spacing-1 { letter-spacing: 1px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
        .archives-page { background-color: var(--bg-gray); }
        .border-left-blue { border-left: 4px solid var(--primary-blue) !important; }
      `}</style>
    </div>
  );
}