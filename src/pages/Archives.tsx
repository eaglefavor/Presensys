import { useState } from 'react';
import { Search, Archive, History, BarChart3, Calendar, Download, Share2, FileText, FileSpreadsheet } from 'lucide-react';
import { db } from '../db/db';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { exportToCSV, exportToXLSX, exportToPDF, exportToText, downloadText, shareData } from '../lib/ExportUtils';

type ArchiveMode = 'student' | 'compilation';

interface CompilationRow {
  name: string;
  regNumber: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  excusedCount: number;
  percentage: number;
}

export default function Archives() {
  const { user } = useAuthStore();
  const [mode, setMode] = useState<ArchiveMode>('student');

  // Student Search state
  const [searchReg, setSearchReg] = useState('');
  const [studentResult, setStudentResult] = useState<any>(null);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Compilation state
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [compilationData, setCompilationData] = useState<CompilationRow[]>([]);
  const [compilationTitle, setCompilationTitle] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Pagination for timeline
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(studentAttendance.length / itemsPerPage);
  const displayedRecords = studentAttendance.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Load courses when compilation tab is opened
  const loadCourses = async () => {
    if (!user) return;
    // Query local DB first — it holds all courses including unsynced ones
    const localCourses = await db.courses
      .filter(c => c.isDeleted !== 1)
      .toArray();
    if (localCourses.length > 0) {
      setCourses(localCourses.map(c => ({ id: c.serverId, code: c.code, title: c.title })));
      return;
    }
    // Fall back to Supabase when local DB is empty (e.g. first load on a new device)
    const { data } = await supabase
      .from('courses')
      .select('id, code, title')
      .eq('user_id', user.id)
      .eq('is_deleted', 0);
    if (data) setCourses(data);
  };

  const handleModeSwitch = (newMode: ArchiveMode) => {
    setMode(newMode);
    if (newMode === 'compilation' && courses.length === 0) {
      loadCourses();
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchReg.trim()) return;
    setLoading(true);
    setPage(1);

    // 1. Find student (Local first, then Cloud)
    let student: any = await db.students.where('regNumber').equals(searchReg.trim()).first();

    if (!student) {
      const { data } = await supabase.from('students').select('*').eq('reg_number', searchReg.trim()).single();
      if (data) {
        student = { serverId: data.id, name: data.name, regNumber: data.reg_number, synced: 1, isDeleted: 0 };
      }
    }

    if (!student) {
      setStudentResult(null);
      setStudentAttendance([]); // clear any previous search results
      toast.error('Student not found.');
      setLoading(false);
      return;
    }

    setStudentResult(student);

    // 2. Fetch Attendance History (Cloud-First for Archive)
    const { data: records, error } = await supabase
      .from('attendance_records')
      .select(`
            status, marked_at,
            attendance_sessions (date, title, courses (code, title))
        `)
      .eq('student_id', student.serverId)
      .order('marked_at', { ascending: false });

    if (error) {
      console.error(error);
      toast.error('Failed to fetch history from cloud.');
      setLoading(false);
      return;
    }

    const detailedRecords = records
      .filter((r: any) => r.attendance_sessions && r.attendance_sessions.courses)
      .map((r: any) => ({
        status: r.status,
        timestamp: r.marked_at,
        session: { date: r.attendance_sessions.date, title: r.attendance_sessions.title },
        course: { code: r.attendance_sessions.courses.code, title: r.attendance_sessions.courses.title }
      }));

    setStudentAttendance(detailedRecords);
    setLoading(false);
  };

  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !startDate || !endDate) {
      toast.error('Please select a course and date range.');
      return;
    }
    setLoading(true);
    setCompilationData([]);

    const selectedCourse = courses.find(c => c.id === selectedCourseId);
    setCompilationTitle(`${selectedCourse?.code || 'Course'} — ${selectedCourse?.title || ''}`);

    // 1. Get all sessions for this course in the date range
    const { data: sessions, error: sessErr } = await supabase
      .from('attendance_sessions')
      .select('id, date, title')
      .eq('course_id', selectedCourseId)
      .eq('is_deleted', 0)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (sessErr || !sessions || sessions.length === 0) {
      toast.error(sessErr ? 'Failed to fetch sessions.' : 'No sessions found in this period.');
      setLoading(false);
      return;
    }

    const sessionIds = sessions.map(s => s.id);

    // 2. Get all attendance records for those sessions
    const { data: records, error: recErr } = await supabase
      .from('attendance_records')
      .select('student_id, status, session_id')
      .in('session_id', sessionIds)
      .eq('is_deleted', 0);

    if (recErr) {
      toast.error('Failed to fetch attendance records.');
      setLoading(false);
      return;
    }

    // 3. Get enrolled students for this course
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('student_id, students (id, name, reg_number)')
      .eq('course_id', selectedCourseId)
      .eq('is_deleted', 0);

    if (!enrollments || enrollments.length === 0) {
      toast.error('No enrolled students found for this course.');
      setLoading(false);
      return;
    }

    // 4. Compile per-student stats
    const totalSessions = sessions.length;
    const compilation: CompilationRow[] = enrollments.map((enr: any) => {
      const student = enr.students;
      const studentRecords = (records || []).filter((r: any) => r.student_id === student.id);
      const presentCount = studentRecords.filter((r: any) => r.status === 'present').length;
      const absentCount = studentRecords.filter((r: any) => r.status === 'absent').length;
      const excusedCount = studentRecords.filter((r: any) => r.status === 'excused').length;

      return {
        name: student.name,
        regNumber: student.reg_number,
        totalSessions,
        presentCount,
        absentCount,
        excusedCount,
        percentage: totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0
      };
    });

    // Sort by percentage descending
    compilation.sort((a, b) => b.percentage - a.percentage);
    setCompilationData(compilation);
    setLoading(false);
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'pdf' | 'text' | 'share') => {
    setShowExportMenu(false);
    const profile = useAuthStore.getState().profile;
    const meta = { faculty: profile?.faculty, department: profile?.department, level: profile?.level };

    const exportData = compilationData.map((row, idx) => ({
      'S/N': idx + 1,
      'Name': row.name,
      'Reg Number': row.regNumber,
      'Total Sessions': row.totalSessions,
      'Present': row.presentCount,
      'Absent': row.absentCount,
      'Excused': row.excusedCount,
      'Attendance %': `${row.percentage}%`,
    }));

    const filename = `attendance_${compilationTitle.replace(/\s+/g, '_')}_${startDate}_to_${endDate}`;
    const title = `Attendance Compilation: ${compilationTitle} | Period: ${startDate} to ${endDate}`;

    switch (format) {
      case 'csv':
        exportToCSV(exportData, filename, meta);
        toast.success('CSV downloaded!');
        break;
      case 'xlsx':
        exportToXLSX(exportData, filename, meta);
        toast.success('Excel file downloaded!');
        break;
      case 'pdf':
        exportToPDF(exportData, title, filename, meta);
        toast.success('PDF downloaded!');
        break;
      case 'text': {
        const text = exportToText(exportData, title, meta);
        downloadText(text, filename);
        toast.success('Text file downloaded!');
        break;
      }
      case 'share': {
        const text = exportToText(exportData, title, meta);
        shareData(text, `Attendance: ${compilationTitle}`).then(ok => {
          if (ok) toast.success('Shared / Copied to clipboard!');
        });
        break;
      }
    }
  };

  return (
    <div className="archives-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm sticky-top" style={{ zIndex: 100 }}>
        <h1 className="h4 fw-black mb-1 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>DATA ARCHIVES</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-3">Institutional Search Engine</p>

        {/* Mode Switcher */}
        <div className="mode-switcher-wrapper p-1 shadow-sm border mb-4">
          <button className={`mode-btn ${mode === 'student' ? 'active' : ''}`} onClick={() => handleModeSwitch('student')}>
            <Search size={12} className="me-1" /> Student Lookup
          </button>
          <button className={`mode-btn ${mode === 'compilation' ? 'active' : ''}`} onClick={() => handleModeSwitch('compilation')}>
            <BarChart3 size={12} className="me-1" /> Course Compilation
          </button>
        </div>

        {mode === 'student' ? (
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
        ) : (
          <form onSubmit={handleCompile}>
            <div className="mb-2">
              <select className="form-select rounded-3 fw-bold border-light bg-light py-2" value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} required>
                <option value="">Select Course...</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-6">
                <div className="d-flex align-items-center gap-1">
                  <Calendar size={14} className="text-muted flex-shrink-0" />
                  <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
              </div>
              <div className="col-6">
                <div className="d-flex align-items-center gap-1">
                  <Calendar size={14} className="text-muted flex-shrink-0" />
                  <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
              </div>
            </div>
            <button className="btn btn-primary w-100 py-2 rounded-3 fw-black xx-small shadow-sm text-uppercase" type="submit" disabled={loading}>
              {loading ? 'Compiling...' : 'COMPILE ATTENDANCE'}
            </button>
          </form>
        )}
      </div>

      <div className="px-4 container-mobile">
        <AnimatePresence mode="wait">
          {mode === 'student' ? (
            /* ===== STUDENT LOOKUP MODE ===== */
            studentResult ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="results">
                {/* Profile Overview */}
                <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4 text-center overflow-hidden position-relative border-left-blue">
                  <div className="avatar-circle-lg mx-auto mb-3 bg-primary bg-opacity-10 text-primary fw-black h2 d-flex align-items-center justify-content-center" style={{ width: '80px', height: '80px', borderRadius: '24px' }}>
                    {studentResult.name[0]}
                  </div>
                  <h4 className="fw-black mb-1 text-dark text-uppercase">{studentResult.name}</h4>
                  <p className="xx-small fw-black text-muted tracking-widest mb-4 font-monospace">{studentResult.regNumber}</p>

                  <div className="row g-2">
                    <div className="col-6">
                      <div className="bg-light p-3 rounded-3 border">
                        <div className="xx-small fw-bold text-muted uppercase mb-1">History Size</div>
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

                {/* Timeline */}
                <div className="d-flex justify-content-between align-items-center mb-3 px-1">
                  <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">Attendance Timeline (Cloud)</h6>
                </div>

                <div className="d-flex flex-column gap-2">
                  {displayedRecords.map((record, idx) => (
                    <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
                      <div className="d-flex align-items-center gap-3">
                        <div className={`p-2 rounded-2 ${record.status === 'present' ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                          {record.status === 'present' ? <History size={20} /> : <Archive size={20} />}
                        </div>
                        <div className="flex-grow-1 overflow-hidden text-start">
                          <div className="d-flex justify-content-between align-items-start">
                            <h6 className="fw-black mb-0 text-dark small uppercase">{record.course?.code}</h6>
                            <span className="xx-small fw-black text-muted uppercase">{new Date(record.session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
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

                  {studentAttendance.length > itemsPerPage && (
                    <div className="d-flex justify-content-between align-items-center mt-4">
                      <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={page === 1} onClick={() => setPage(p => Math.max(p - 1, 1))}>PREV</button>
                      <span className="xx-small fw-black text-muted uppercase">Page {page} of {totalPages}</span>
                      <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={page === totalPages} onClick={() => setPage(p => Math.min(p + 1, totalPages))}>NEXT</button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="empty" className="text-center py-5 mt-5">
                <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><Search size={48} className="text-muted opacity-25" /></div>
                <h5 className="fw-black text-muted text-uppercase tracking-widest"> institutional archive</h5>
                <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Records are fetched from the cloud repository</p>
              </motion.div>
            )
          ) : (
            /* ===== COMPILATION MODE ===== */
            compilationData.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="compilation">
                {/* Summary Card */}
                <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4 border-left-blue">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="fw-black text-dark text-uppercase letter-spacing-n1 mb-1">{compilationTitle}</h5>
                      <p className="xx-small fw-bold text-muted uppercase tracking-widest mb-0">{startDate} → {endDate}</p>
                    </div>
                    <div className="position-relative">
                      <button className="btn btn-primary btn-sm rounded-pill px-3 fw-black xx-small shadow-sm d-flex align-items-center gap-1" onClick={() => setShowExportMenu(!showExportMenu)}>
                        <Download size={12} /> EXPORT
                      </button>
                      {showExportMenu && (
                        <div className="position-absolute end-0 mt-1 bg-white shadow-lg rounded-4 border p-2" style={{ zIndex: 200, minWidth: '180px' }}>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('csv')}><FileText size={14} className="text-success" /> CSV File</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('xlsx')}><FileSpreadsheet size={14} className="text-primary" /> Excel (XLSX)</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('pdf')}><FileText size={14} className="text-danger" /> PDF Document</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('text')}><FileText size={14} className="text-muted" /> Plain Text</button>
                          <hr className="dropdown-divider" />
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('share')}><Share2 size={14} className="text-info" /> Share (WhatsApp, etc.)</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-4">
                      <div className="bg-light p-2 rounded-3 text-center border">
                        <div className="h6 mb-0 fw-black text-dark">{compilationData.length}</div>
                        <div className="xx-small fw-bold text-muted">STUDENTS</div>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="bg-light p-2 rounded-3 text-center border">
                        <div className="h6 mb-0 fw-black text-primary">{compilationData[0]?.totalSessions || 0}</div>
                        <div className="xx-small fw-bold text-muted">SESSIONS</div>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="bg-light p-2 rounded-3 text-center border">
                        <div className="h6 mb-0 fw-black text-success">{Math.round(compilationData.reduce((a, b) => a + b.percentage, 0) / compilationData.length)}%</div>
                        <div className="xx-small fw-bold text-muted">AVG %</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Student List */}
                <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 px-1">Per-Student Breakdown</h6>
                <div className="d-flex flex-column gap-2">
                  {compilationData.map((row, idx) => (
                    <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
                      <div className="d-flex align-items-center gap-3">
                        <div className={`p-2 rounded-2 fw-black small d-flex align-items-center justify-content-center ${row.percentage >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`} style={{ width: '44px', height: '44px', borderRadius: '12px' }}>
                          {row.percentage}%
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                          <h6 className="fw-bold mb-0 text-dark text-uppercase small letter-spacing-n1 text-truncate">{row.name}</h6>
                          <div className="xx-small fw-black text-muted font-monospace tracking-widest">{row.regNumber}</div>
                        </div>
                        <div className="text-end">
                          <div className="xx-small fw-black text-success">{row.presentCount}P</div>
                          <div className="xx-small fw-black text-danger">{row.absentCount}A</div>
                        </div>
                      </div>
                      {/* Attendance bar */}
                      <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: '#f1f3f5' }}>
                        <div className={`h-100 rounded-pill ${row.percentage >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${row.percentage}%`, transition: 'width 0.5s ease' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="comp-empty" className="text-center py-5 mt-3">
                <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><BarChart3 size={48} className="text-muted opacity-25" /></div>
                <h5 className="fw-black text-muted text-uppercase tracking-widest">Course Attendance</h5>
                <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Select a course and date range above to compile</p>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
