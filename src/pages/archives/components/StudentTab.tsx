import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronDown, ChevronUp, Calendar, X, Search } from 'lucide-react';
import { CircularProgress, DonutChart, AttendanceHeatmap, SkeletonCard, StatusIcon } from './ArchiveHelpers';
import { statusBadgeClass } from './ArchiveUtils';
import type { AttendanceDetail, StudentResult } from './ArchiveTypes';

interface StudentTabProps {
  studentResult: StudentResult | null;
  studentAttendance: AttendanceDetail[];
  showCompare: boolean;
  setShowCompare: (val: boolean) => void;
  compareResult: StudentResult | null;
  setCompareResult: (val: StudentResult | null) => void;
  compareAttendance: AttendanceDetail[];
  setCompareAttendance: (val: AttendanceDetail[]) => void;
  compareQuery: string;
  setCompareQuery: (val: string) => void;
  handleCompareSearch: (e: React.FormEvent) => void;
  loading: boolean;
  expandedCourses: Set<string>;
  setExpandedCourses: React.Dispatch<React.SetStateAction<Set<string>>>;
  studentCourseFilter: string;
  setStudentCourseFilter: (val: string) => void;
  studentDateStart: string;
  setStudentDateStart: (val: string) => void;
  studentDateEnd: string;
  setStudentDateEnd: (val: string) => void;
  studentPage: number;
  setStudentPage: React.Dispatch<React.SetStateAction<number>>;
  studentItemsPerPage: number;
}

export function StudentTab({
  studentResult, studentAttendance,
  showCompare, setShowCompare,
  compareResult, setCompareResult,
  compareAttendance, setCompareAttendance,
  compareQuery, setCompareQuery, handleCompareSearch,
  loading, expandedCourses, setExpandedCourses,
  studentCourseFilter, setStudentCourseFilter,
  studentDateStart, setStudentDateStart,
  studentDateEnd, setStudentDateEnd,
  studentPage, setStudentPage, studentItemsPerPage
}: StudentTabProps) {

  const getOverallPct = (records: AttendanceDetail[]) => {
    if (records.length === 0) return 0;
    const p = records.filter(r => r.status === 'present').length;
    return Math.round((p / records.length) * 100);
  };
  const overallStudentPct = getOverallPct(studentAttendance);
  const overallComparePct = getOverallPct(compareAttendance);

  const getCourseSummaries = (records: AttendanceDetail[]) => {
    const map = new Map<string, { code: string; present: number; absent: number; excused: number; total: number }>();
    for (const r of records) {
      if (!map.has(r.course.code)) {
        map.set(r.course.code, { code: r.course.code, present: 0, absent: 0, excused: 0, total: 0 });
      }
      const st = map.get(r.course.code)!;
      st.total++;
      if (r.status === 'present') st.present++;
      else if (r.status === 'absent') st.absent++;
      else if (r.status === 'excused') st.excused++;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  };
  const courseSummaries = useMemo(() => getCourseSummaries(studentAttendance), [studentAttendance]);

  const filteredStudentAttendance = useMemo(() => {
    return studentAttendance.filter(r => {
      if (studentCourseFilter && r.course.code !== studentCourseFilter) return false;
      if (studentDateStart && new Date(r.session.date) < new Date(studentDateStart)) return false;
      if (studentDateEnd && new Date(r.session.date) > new Date(studentDateEnd)) return false;
      return true;
    }).sort((a, b) => new Date(b.session.date).getTime() - new Date(a.session.date).getTime());
  }, [studentAttendance, studentCourseFilter, studentDateStart, studentDateEnd]);

  const studentTotalPages = Math.max(1, Math.ceil(filteredStudentAttendance.length / studentItemsPerPage));
  const displayedStudentRecords = filteredStudentAttendance.slice((studentPage - 1) * studentItemsPerPage, studentPage * studentItemsPerPage);

  if (!studentResult) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="student-empty" className="text-center py-5 mt-3">
        {loading ? (
          <div className="d-flex flex-column gap-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : (
          <>
            <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><Search size={48} className="text-muted opacity-25" /></div>
            <h5 className="fw-black text-muted text-uppercase tracking-widest">Search the Archive</h5>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Enter a reg number or student name above</p>
          </>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="student-results">

      {/* Compare toggle */}
      <div className="d-flex justify-content-end mb-2">
        <button
          className={`btn btn-sm rounded-pill fw-black xx-small px-3 shadow-sm ${showCompare ? 'btn-primary' : 'btn-light border'}`}
          onClick={() => { setShowCompare(!showCompare); setCompareResult(null); setCompareAttendance([]); setCompareQuery(''); }}
        >
          <Users size={11} className="me-1" /> COMPARE
        </button>
      </div>

      {showCompare ? (
        /* ── Side-by-side compare cards ── */
        <div className="row g-2 mb-3">
          <div className="col-6">
            <div className="card border-0 bg-white shadow-sm p-3 rounded-4" style={{ borderLeft: '4px solid #0d6efd' }}>
              <div className="d-flex align-items-center gap-2">
                <CircularProgress percentage={overallStudentPct} />
                <div className="overflow-hidden">
                  <h6 className="fw-black mb-0 text-dark small text-uppercase letter-spacing-n1 text-truncate">{studentResult.name}</h6>
                  <div className="xx-small fw-black text-muted font-monospace">{studentResult.regNumber}</div>
                  <div className="xx-small fw-bold mt-1 text-muted text-truncate">{studentAttendance.length} records total</div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-6">
            {!compareResult ? (
              <div className="card border-0 bg-light shadow-inner p-3 rounded-4 h-100 d-flex flex-column justify-content-center">
                <form onSubmit={handleCompareSearch} className="d-flex flex-column gap-2">
                  <input
                    type="text" className="form-control form-control-sm rounded-pill fw-bold border-0 shadow-sm"
                    placeholder="Compare with reg #..." value={compareQuery} onChange={e => setCompareQuery(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary btn-sm rounded-pill fw-black xx-small" disabled={loading || compareQuery.length < 3}>
                    {loading ? 'SEARCHING...' : 'FIND STUDENT'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="card border-0 bg-white shadow-sm p-3 rounded-4 position-relative" style={{ borderLeft: '4px solid #6c757d' }}>
                <button
                  className="btn btn-link btn-sm p-0 position-absolute top-0 end-0 m-2 text-muted"
                  onClick={() => { setCompareResult(null); setCompareAttendance([]); setCompareQuery(''); }}
                >
                  <X size={14} />
                </button>
                <div className="d-flex align-items-center gap-2">
                  <CircularProgress percentage={overallComparePct} />
                  <div className="overflow-hidden">
                    <h6 className="fw-black mb-0 text-dark small text-uppercase letter-spacing-n1 text-truncate">{compareResult.name}</h6>
                    <div className="xx-small fw-black text-muted font-monospace">{compareResult.regNumber}</div>
                    <div className="xx-small fw-bold mt-1 text-muted text-truncate">{compareAttendance.length} records total</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Standard profile card ── */
        <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-3" style={{ borderLeft: '4px solid #0d6efd' }}>
          <div className="d-flex justify-content-between align-items-start">
            <div className="d-flex align-items-center gap-3">
              <CircularProgress percentage={overallStudentPct} />
              <div>
                <h5 className="fw-black text-dark text-uppercase letter-spacing-n1 mb-1">{studentResult.name}</h5>
                <p className="xx-small fw-black text-muted font-monospace mb-1">{studentResult.regNumber}</p>
                <div className="d-flex gap-3 mt-2">
                  <div className="xx-small fw-bold"><span className="text-success fw-black">{studentAttendance.filter(r => r.status === 'present').length}</span> Present</div>
                  <div className="xx-small fw-bold"><span className="text-danger fw-black">{studentAttendance.filter(r => r.status === 'absent').length}</span> Absent</div>
                  <div className="xx-small fw-bold"><span className="text-warning fw-black">{studentAttendance.filter(r => r.status === 'excused').length}</span> Excused</div>
                </div>
              </div>
            </div>
            <div className="text-end d-none d-sm-block">
              <h2 className="fw-black mb-0 text-dark">{studentAttendance.length}</h2>
              <p className="xx-small fw-bold text-muted uppercase tracking-widest">Total Records</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-top" style={{ borderColor: '#f1f3f5' }}>
            <AttendanceHeatmap records={studentAttendance} />
          </div>
        </div>
      )}

      <div className="row g-3">
        {/* ── Collapsible Courses List ── */}
        <div className={showCompare ? "col-12" : "col-12"}>
          {courseSummaries.length > 0 && (
            <div className="d-flex flex-column gap-2 mb-3">
              <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-1 px-1">
                Course Breakdown ({courseSummaries.length})
              </h6>
              {courseSummaries.map(cs => {
                const pct = Math.round((cs.present / cs.total) * 100);
                const isOpen = expandedCourses.has(cs.code);
                const courseRecs = studentAttendance.filter(r => r.course.code === cs.code)
                  .sort((a, b) => new Date(b.session.date).getTime() - new Date(a.session.date).getTime());

                return (
                  <div key={cs.code} className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden">
                    <div
                      className="p-3 cursor-pointer active-scale"
                      onClick={() => {
                        setExpandedCourses(prev => {
                          const next = new Set(prev);
                          if (next.has(cs.code)) next.delete(cs.code); else next.add(cs.code);
                          return next;
                        });
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-3">
                          <div className={`fw-black small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${pct >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`} style={{ width: '44px', height: '44px', fontSize: '12px' }}>
                            {pct}%
                          </div>
                          <div>
                            <h6 className="fw-black mb-0 text-dark small uppercase">{cs.code}</h6>
                            <div className="xx-small fw-bold text-muted">{cs.total} sessions recorded</div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-3">
                          <DonutChart present={cs.present} absent={cs.absent} excused={cs.excused} />
                          {isOpen ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                        </div>
                      </div>
                      <div className="px-3 pb-1">
                        <div className="rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: '#f1f3f5' }}>
                          <div className={`h-100 rounded-pill ${pct >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 pt-2 border-top" style={{ borderColor: '#f1f3f5' }}>
                              <div className="d-flex flex-column gap-1">
                                {courseRecs.map((r, i) => (
                                  <div key={i} className="d-flex align-items-center gap-2 py-1">
                                    <span className={`badge rounded-pill xx-small fw-black px-2 py-1 flex-shrink-0 ${statusBadgeClass(r.status)}`} style={{ minWidth: '60px', textAlign: 'center' }}>
                                      {r.status.toUpperCase()}
                                    </span>
                                    <span className="fw-bold xx-small text-dark text-uppercase text-truncate">{r.session.title || r.course.title}</span>
                                    <span className="xx-small text-muted font-monospace ms-auto flex-shrink-0">
                                      {new Date(r.session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Date-range filter + paginated flat timeline ── */}
        {!showCompare && (
          <>
            <div className="mb-3">
              {/* Course filter chips */}
              {courseSummaries.length > 1 && (
                <div className="d-flex gap-2 flex-wrap mb-2">
                  <button
                    className={`btn btn-sm rounded-pill fw-black xx-small px-3 ${studentCourseFilter === '' ? 'btn-primary' : 'btn-light border'}`}
                    onClick={() => { setStudentCourseFilter(''); setStudentPage(1); }}
                  >
                    ALL
                  </button>
                  {courseSummaries.map(cs => (
                    <button
                      key={cs.code}
                      className={`btn btn-sm rounded-pill fw-black xx-small px-3 ${studentCourseFilter === cs.code ? 'btn-primary' : 'btn-light border'}`}
                      onClick={() => { setStudentCourseFilter(cs.code); setStudentPage(1); }}
                    >
                      {cs.code}
                    </button>
                  ))}
                </div>
              )}
              <div className="row g-2">
                <div className="col-6">
                  <div className="d-flex align-items-center gap-1">
                    <Calendar size={12} className="text-muted flex-shrink-0" />
                    <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light xx-small" value={studentDateStart} onChange={e => { setStudentDateStart(e.target.value); setStudentPage(1); }} />
                  </div>
                </div>
                <div className="col-6">
                  <div className="d-flex align-items-center gap-1">
                    <Calendar size={12} className="text-muted flex-shrink-0" />
                    <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light xx-small" value={studentDateEnd} onChange={e => { setStudentDateEnd(e.target.value); setStudentPage(1); }} />
                  </div>
                </div>
              </div>
              {(studentCourseFilter || studentDateStart || studentDateEnd) && (
                <div className="d-flex justify-content-end mt-1">
                  <button
                    className="btn btn-link btn-sm xx-small text-muted fw-bold p-0 d-flex align-items-center gap-1"
                    onClick={() => { setStudentCourseFilter(''); setStudentDateStart(''); setStudentDateEnd(''); setStudentPage(1); }}
                  >
                    <X size={11} /> Clear Filters
                  </button>
                </div>
              )}
            </div>

            {(studentCourseFilter || studentDateStart || studentDateEnd) && (
              <>
                <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-2 px-1">
                  Filtered Timeline ({filteredStudentAttendance.length})
                </h6>
                <div className="d-flex flex-column gap-2">
                  {displayedStudentRecords.length === 0 ? (
                    <div className="text-center py-4 text-muted xx-small fw-bold uppercase">No records match the current filters.</div>
                  ) : displayedStudentRecords.map((record, idx) => (
                    <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
                      <div className="d-flex align-items-center gap-3">
                        <div className={`p-2 rounded-2 ${record.status === 'present' ? 'bg-success bg-opacity-10 text-success' : record.status === 'absent' ? 'bg-danger bg-opacity-10 text-danger' : 'bg-warning bg-opacity-10 text-warning'}`}>
                          <StatusIcon status={record.status} />
                        </div>
                        <div className="flex-grow-1 overflow-hidden text-start">
                          <div className="d-flex justify-content-between align-items-start">
                            <h6 className="fw-black mb-0 text-dark small uppercase">{record.course?.code}</h6>
                            <span className="xx-small fw-black text-muted uppercase flex-shrink-0 ms-2">
                              {new Date(record.session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <p className="xx-small fw-bold text-muted mb-0 text-truncate text-uppercase">
                            {record.session.title || record.course?.title}
                          </p>
                        </div>
                        <span className={`badge rounded-pill xx-small fw-black px-3 ${statusBadgeClass(record.status)}`}>
                          {record.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}

                  {filteredStudentAttendance.length > studentItemsPerPage && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === 1} onClick={() => setStudentPage(p => p - 1)}>PREV</button>
                      <span className="xx-small fw-black text-muted uppercase">Page {studentPage} of {studentTotalPages}</span>
                      <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === studentTotalPages} onClick={() => setStudentPage(p => p + 1)}>NEXT</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
