import { useState } from 'react';
import { Search, User, Download, Archive, History } from 'lucide-react';
import { db } from '../db/db';
import { motion, AnimatePresence } from 'framer-motion';

export default function Archives() {
  const [searchReg, setSearchReg] = useState('');
  const [studentResult, setStudentResult] = useState<any>(null);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchReg.trim()) return;
    setLoading(true);

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
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <h1 className="h4 fw-black mb-1 text-primary" style={{ color: 'var(--primary-blue)' }}>DATA ARCHIVES</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-4">Search student history</p>
        
        <form onSubmit={handleSearch}>
          <div className="modern-input-unified p-1 d-flex align-items-center bg-light shadow-inner">
            <Search size={20} className="text-muted ms-3" />
            <input 
              type="text" className="form-control border-0 bg-transparent py-3 fw-bold" 
              placeholder="Enter Registration Number..." 
              value={searchReg} onChange={e => setSearchReg(e.target.value)} 
            />
            <button className="btn btn-primary rounded-3 px-4 fw-black xx-small me-1 py-2" type="submit" disabled={loading}>
              {loading ? '...' : 'FIND'}
            </button>
          </div>
        </form>
      </div>

      <div className="px-4 container-mobile">
        <AnimatePresence mode="wait">
          {studentResult ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="results">
              {/* Profile Overview Card */}
              <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4 text-center overflow-hidden position-relative">
                <div className="position-absolute top-0 end-0 p-3 opacity-5"><User size={100} /></div>
                <div className="avatar-circle-lg mx-auto mb-3 bg-primary bg-opacity-10 text-primary fw-black h2 shadow-sm d-flex align-items-center justify-content-center" style={{ width: '80px', height: '80px', borderRadius: '24px' }}>
                  {studentResult.name[0]}
                </div>
                <h4 className="fw-black mb-1 text-dark uppercase letter-spacing-n1">{studentResult.name}</h4>
                <p className="xx-small fw-black text-muted tracking-widest mb-4">{studentResult.regNumber}</p>
                
                <div className="row g-2">
                  <div className="col-6">
                    <div className="bg-light p-3 rounded-3">
                      <div className="xx-small fw-bold text-muted uppercase mb-1">Classes</div>
                      <div className="h4 mb-0 fw-black text-dark">{studentAttendance.length}</div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="bg-light p-3 rounded-3">
                      <div className="xx-small fw-bold text-muted uppercase mb-1">Present</div>
                      <div className="h4 mb-0 fw-black text-success">{studentAttendance.filter(r => r.status === 'present').length}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Feed */}
              <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 px-1">Attendance Timeline</h6>
              <div className="d-flex flex-column gap-2">
                {studentAttendance.map((record, idx) => (
                  <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
                    <div className="d-flex align-items-center gap-3">
                      <div className={`p-2 rounded-2 ${record.status === 'present' ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {record.status === 'present' ? <History size={20} /> : <Archive size={20} />}
                      </div>
                      <div className="flex-grow-1 overflow-hidden">
                        <div className="d-flex justify-content-between align-items-start">
                          <h6 className="fw-bold mb-0 text-dark small uppercase">{record.course?.code}</h6>
                          <span className="xx-small fw-black text-muted">{new Date(record.session.date).toLocaleDateString()}</span>
                        </div>
                        <p className="xx-small fw-bold text-muted mb-0 text-truncate">{record.course?.title}</p>
                      </div>
                      <div className="text-end ps-2">
                        <span className={`badge rounded-pill xx-small fw-bold ${record.status === 'present' ? 'bg-success-subtle text-success' : record.status === 'absent' ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning-emphasis'}`}>
                          {record.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {studentAttendance.length === 0 && (
                  <div className="text-center py-5 bg-white rounded-4 border-dashed">
                    <p className="xx-small fw-bold text-muted uppercase">No historical records found</p>
                  </div>
                )}
              </div>
              
              <button className="btn btn-light w-100 py-3 rounded-3 mt-4 border fw-bold small d-flex align-items-center justify-content-center gap-2">
                <Download size={18} /> EXPORT FULL PDF
              </button>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="empty" className="text-center py-5 mt-5">
              <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><Search size={48} className="text-muted opacity-25" /></div>
              <h5 className="fw-black text-muted">AWAITING INPUT</h5>
              <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Lookup student by registration number</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1.2px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
        .archives-page { background-color: var(--bg-gray); }
      `}</style>
    </div>
  );
}
