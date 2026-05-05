import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, Download, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { SkeletonCard, DonutChart } from './ArchiveHelpers';
import type { SemesterCourseRow, CompilationRow, ActiveSemester } from './ArchiveTypes';

interface SemesterTabProps {
  semesterLoaded: boolean;
  semesterRows: SemesterCourseRow[];
  activeSemester: ActiveSemester | null;
  handleExportSemester: (meta?: { faculty?: string; department?: string; level?: string }) => void;
  expandedSemCourseId: string | null;
  handleExpandSemCourse: (courseId: string) => void;
  semRollCallMap: Record<string, CompilationRow[]>;
  loading: boolean;
}

export function SemesterTab({
  semesterLoaded, semesterRows, activeSemester,
  handleExportSemester, expandedSemCourseId, handleExpandSemCourse,
  semRollCallMap, loading
}: SemesterTabProps) {

  const [showSemesterExportMenu, setShowSemesterExportMenu] = useState(false);
  const [exportMeta, setExportMeta] = useState({ faculty: '', department: '', level: '' });

  if (!semesterLoaded || semesterRows.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="semester-empty" className="text-center py-5 mt-3">
        {loading ? (
          <div className="d-flex flex-column gap-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : (
          <>
            <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><LayoutGrid size={48} className="text-muted opacity-25" /></div>
            <h5 className="fw-black text-muted text-uppercase tracking-widest">Semester Summary</h5>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Click LOAD SUMMARY above to see all courses side-by-side</p>
          </>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="semester">
      <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 px-1">
        {activeSemester?.name} — {semesterRows.length} Course{semesterRows.length !== 1 ? 's' : ''} (sorted by attendance ↑)
      </h6>

      {/* Overall donut */}
      <div className="card border-0 bg-white shadow-sm p-3 rounded-4 mb-3 d-flex flex-row align-items-center gap-3">
        <DonutChart
          present={semesterRows.reduce((a, b) => a + b.presentCount, 0)}
          absent={semesterRows.reduce((a, b) => a + b.absentCount, 0)}
          excused={semesterRows.reduce((a, b) => a + b.excusedCount, 0)}
        />
        <div>
          <div className="fw-black small text-dark uppercase">{activeSemester?.name}</div>
          <div className="xx-small text-muted">
            {semesterRows.reduce((a, b) => a + b.sessionsHeld, 0)} sessions across {semesterRows.length} course{semesterRows.length !== 1 ? 's' : ''}
          </div>
          <div className="xx-small fw-black mt-1" style={{ color: Math.round(semesterRows.reduce((a, b) => a + b.avgAttendance, 0) / semesterRows.length) >= 75 ? '#198754' : '#dc3545' }}>
            Avg {Math.round(semesterRows.reduce((a, b) => a + b.avgAttendance, 0) / semesterRows.length)}% attendance
          </div>
        </div>
        <div className="ms-auto position-relative">
          <button className="btn btn-primary btn-sm rounded-pill px-3 fw-black xx-small shadow-sm d-flex align-items-center gap-1" onClick={() => setShowSemesterExportMenu(!showSemesterExportMenu)}>
            <Download size={12} /> EXPORT
          </button>
          {showSemesterExportMenu && (
            <div className="position-absolute end-0 mt-1 bg-white shadow-lg rounded-4 border p-3" style={{ zIndex: 200, minWidth: '260px' }}>
              <div className="mb-2">
                <label className="form-label xx-small fw-bold text-muted mb-1">Faculty (optional)</label>
                <input type="text" className="form-control form-control-sm xx-small fw-bold" placeholder="e.g. Engineering" value={exportMeta.faculty} onChange={e => setExportMeta(prev => ({ ...prev, faculty: e.target.value }))} />
              </div>
              <div className="mb-2">
                <label className="form-label xx-small fw-bold text-muted mb-1">Department (optional)</label>
                <input type="text" className="form-control form-control-sm xx-small fw-bold" placeholder="e.g. Computer Science" value={exportMeta.department} onChange={e => setExportMeta(prev => ({ ...prev, department: e.target.value }))} />
              </div>
              <div className="mb-3">
                <label className="form-label xx-small fw-bold text-muted mb-1">Level (optional)</label>
                <input type="text" className="form-control form-control-sm xx-small fw-bold" placeholder="e.g. 400L" value={exportMeta.level} onChange={e => setExportMeta(prev => ({ ...prev, level: e.target.value }))} />
              </div>
              <button className="btn btn-primary w-100 btn-sm rounded-3 fw-black xx-small d-flex align-items-center justify-content-center gap-1" onClick={() => { handleExportSemester(exportMeta); setShowSemesterExportMenu(false); }}>
                <FileSpreadsheet size={14} /> GENERATE EXCEL BOOK
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="d-flex flex-column gap-2">
        {semesterRows.map(row => {
          const isExpanded = expandedSemCourseId === row.courseId;
          const students = semRollCallMap[row.courseId];
          return (
            <div key={row.courseId} className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden">
              <div className="p-3 cursor-pointer active-scale" onClick={() => handleExpandSemCourse(row.courseId)}>
                <div className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-3">
                    <div className={`fw-black small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${row.avgAttendance >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`} style={{ width: '44px', height: '44px', fontSize: '12px' }}>
                      {row.avgAttendance}%
                    </div>
                    <div>
                      <h6 className="fw-black mb-0 text-dark small uppercase">{row.code}</h6>
                      <div className="xx-small fw-bold text-muted">{row.sessionsHeld} sessions recorded</div>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <div className="text-end d-none d-sm-block">
                      <div className="xx-small fw-black text-dark text-truncate" style={{ maxWidth: '120px' }}>{row.title}</div>
                      <div className="xx-small fw-black text-muted">{row.enrolledCount} enrolled</div>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                  </div>
                </div>
                <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: '#f1f3f5' }}>
                  <div className={`h-100 rounded-pill ${row.avgAttendance >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${row.avgAttendance}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-2 border-top" style={{ borderColor: '#f1f3f5' }}>
                      {!students ? (
                        <div className="d-flex flex-column gap-2 py-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                      ) : students.length === 0 ? (
                        <div className="text-center py-2 xx-small text-muted fw-bold">No student data.</div>
                      ) : (
                        <div className="d-flex flex-column gap-1">
                          {students.map((s, i) => (
                            <div key={i} className="d-flex align-items-center gap-2 py-1">
                              <div
                                className={`fw-black xx-small rounded-2 px-2 py-1 flex-shrink-0 ${s.percentage >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                                style={{ minWidth: '44px', textAlign: 'center' }}
                              >
                                {s.percentage}%
                              </div>
                              <span className="fw-bold xx-small text-dark text-uppercase text-truncate">{s.name}</span>
                              <span className="xx-small text-muted font-monospace ms-auto flex-shrink-0">{s.regNumber}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
