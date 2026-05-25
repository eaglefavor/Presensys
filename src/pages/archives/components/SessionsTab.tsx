import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { SkeletonCard, DonutChart } from './ArchiveHelpers';
import { statusBadgeClass } from './ArchiveUtils';
import type { SessionRow, RollCallEntry, CourseOption } from './ArchiveTypes';

interface SessionsTabProps {
  sessionsList: SessionRow[];
  courses: CourseOption[];
  sessionsCourseId: string;
  expandedSessionId: string | null;
  handleExpandSession: (sessionId: string) => void;
  rollCallLoading: string | null;
  rollCallMap: Record<string, RollCallEntry[]>;
  loading: boolean;
}

export function SessionsTab({
  sessionsList, courses, sessionsCourseId,
  expandedSessionId, handleExpandSession,
  rollCallLoading, rollCallMap, loading
}: SessionsTabProps) {

  if (sessionsList.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="sessions-empty" className="text-center py-5 mt-3">
        {loading ? (
          <div className="d-flex flex-column gap-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : (
          <>
            <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><Calendar size={48} className="text-muted opacity-25" /></div>
            <h5 className="fw-black text-muted text-uppercase tracking-widest">Session Drill-Down</h5>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Select a course above to see session-by-session records</p>
          </>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="sessions">
      <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 px-1">
        {courses.find(c => c.id === sessionsCourseId)?.code} — {sessionsList.length} Session{sessionsList.length !== 1 ? 's' : ''}
      </h6>
      <div className="d-flex flex-column gap-2">
        {sessionsList.map(session => {
          const isExpanded = expandedSessionId === session.id;
          const isLoadingRoll = rollCallLoading === session.id;
          return (
            <div key={session.id} className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden">
              <div className="p-3 cursor-pointer active-scale" onClick={() => handleExpandSession(session.id)}>
                <div className="d-flex align-items-center gap-3">
                  <div
                    className={`fw-black xx-small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${session.attendanceRate >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                    style={{ width: '44px', height: '44px' }}
                  >
                    {session.attendanceRate}%
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-0 text-dark small text-uppercase letter-spacing-n1 text-truncate">
                      {new Date(session.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </h6>
                    {session.title && <div className="xx-small fw-bold text-muted text-truncate">{session.title}</div>}
                    <div className="xx-small fw-black mt-1 text-muted">
                      <span className="text-success">{session.presentCount}P</span> • <span className="text-danger">{session.absentCount}A</span>
                      {session.excusedCount > 0 && <span> • <span className="text-warning">{session.excusedCount}E</span></span>}
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <DonutChart present={session.presentCount} absent={session.absentCount} excused={session.excusedCount} />
                    {isExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-light"
                  >
                    <div className="p-3 border-top" style={{ borderColor: 'var(--progress-bg)' }}>
                      {isLoadingRoll ? (
                        <div className="text-center py-2 xx-small fw-bold text-muted uppercase">Loading roll call...</div>
                      ) : !rollCallMap[session.id] ? (
                        <div className="text-center py-2 xx-small fw-bold text-muted uppercase">No data.</div>
                      ) : (
                        <div className="d-flex flex-column gap-1">
                          {rollCallMap[session.id].map((entry, idx) => (
                            <div key={idx} className="d-flex align-items-center gap-2 py-1 bg-white px-2 rounded-2 border shadow-sm">
                              <span className={`badge rounded-pill xx-small fw-black px-2 py-1 flex-shrink-0 ${statusBadgeClass(entry.status)}`} style={{ minWidth: '60px', textAlign: 'center' }}>
                                {entry.status.toUpperCase()}
                              </span>
                              <span className="fw-bold xx-small text-dark text-uppercase text-truncate">{entry.name}</span>
                              <span className="xx-small text-muted font-monospace ms-auto flex-shrink-0">{entry.regNumber}</span>
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
