import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Pencil, Check, UserCheck, UserX, Search,
  CheckCircle, XCircle, HelpCircle,
  RotateCcw, Settings2, Download, Share2, FileText, FileSpreadsheet, Trash2
} from 'lucide-react';
import type { LocalAttendanceSession, LocalStudent } from '../../db/db';
import ConfirmDialog from '../../components/ConfirmDialog';

interface ManualMarkingProps {
  currentSession: LocalAttendanceSession | undefined;
  renamingSessionId: string | null;
  deletingSessionId: string | null;
  renameValue: string;
  stats: { present: number, absent: number, excused: number, total: number };
  pendingChanges: Record<string, 'present' | 'absent' | 'excused' | 'reset'>;
  markSearch: string;
  confirmBulkMarkStatus: 'present' | 'absent' | null;
  confirmResetRecords: boolean;
  displayedEnrollments: LocalStudent[];
  combinedRecords: Map<string, "present" | "absent" | "excused" | null>;
  studentPage: number;
  totalStudentPages: number;
  filteredEnrollments: LocalStudent[];
  enrollments: LocalStudent[] | undefined;
  itemsPerStudentPage: number;

  onCancelSession: () => void;
  onRenameSession: () => void;
  onDeleteSession: (id: string) => void;
  setRenamingSessionId: (id: string | null) => void;
  setDeletingSessionId: (id: string | null) => void;
  setRenameValue: (val: string) => void;
  setPendingChanges: (val: Record<string, 'present' | 'absent' | 'excused' | 'reset'>) => void;
  handleSaveAttendance: () => void;
  setMarkSearch: (val: string) => void;
  handleBulkMark: (status: 'present' | 'absent') => void;
  handleResetRecords: () => void;
  handleSessionExport: (type: 'csv' | 'xlsx' | 'pdf' | 'text' | 'share') => void;
  updateRecord: (studentId: string, status: 'present' | 'absent' | 'excused') => void;
  setStudentPage: (page: number | ((p: number) => number)) => void;
  setConfirmBulkMarkStatus: (val: 'present' | 'absent' | null) => void;
  doBulkMark: (status: 'present' | 'absent') => Promise<void>;
  setConfirmResetRecords: (val: boolean) => void;
  doResetRecords: () => Promise<void>;
}

export default function ManualMarking({
  currentSession,
  renamingSessionId,
  deletingSessionId,
  renameValue,
  stats,
  pendingChanges,
  markSearch,
  confirmBulkMarkStatus,
  confirmResetRecords,
  displayedEnrollments,
  combinedRecords,
  studentPage,
  totalStudentPages,
  filteredEnrollments,
  enrollments,
  itemsPerStudentPage,

  onCancelSession,
  onRenameSession,
  onDeleteSession,
  setRenamingSessionId,
  setDeletingSessionId,
  setRenameValue,
  setPendingChanges,
  handleSaveAttendance,
  setMarkSearch,
  handleBulkMark,
  handleResetRecords,
  handleSessionExport,
  updateRecord,
  setStudentPage,
  setConfirmBulkMarkStatus,
  doBulkMark,
  setConfirmResetRecords,
  doResetRecords
}: ManualMarkingProps) {
  return (
    <div className="attendance-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm sticky-top" style={{ zIndex: 100 }}>
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div className="d-flex align-items-center gap-3 overflow-hidden">
            <button className="btn btn-light rounded-circle p-2 shadow-sm flex-shrink-0" onClick={onCancelSession}><ArrowLeft size={20} /></button>
            <div className="overflow-hidden flex-grow-1">
              {renamingSessionId === currentSession?.serverId ? (
                <div className="d-flex align-items-center gap-2">
                  <input
                    className="form-control form-control-sm rounded-3 fw-bold border-primary"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onRenameSession(); if (e.key === 'Escape') setRenamingSessionId(null); }}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-sm rounded-3 px-3 fw-bold" onClick={onRenameSession}><Check size={14} /></button>
                  <button className="btn btn-light btn-sm rounded-3 px-3 fw-bold border" onClick={() => setRenamingSessionId(null)}>✕</button>
                </div>
              ) : (
                <div className="d-flex align-items-center gap-2">
                  <h1 className="h5 fw-black mb-0 text-dark text-uppercase letter-spacing-n1 text-truncate">{currentSession?.title}</h1>
                  <button
                    className="btn btn-link p-0 text-muted flex-shrink-0"
                    onClick={() => {
                      if (currentSession) {
                        setRenameValue(currentSession.title);
                        setRenamingSessionId(currentSession.serverId);
                      }
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-link p-0 text-danger flex-shrink-0 ms-1"
                    onClick={() => {
                      if (currentSession) {
                        setDeletingSessionId(currentSession.serverId);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
              <p className="xx-small fw-bold text-muted mb-0 uppercase tracking-widest">{stats.present + stats.absent + stats.excused} / {stats.total} MARKED</p>
            </div>
          </div>
          <div className="bg-primary text-white rounded-pill px-3 py-1 fw-black xx-small shadow-sm">{Math.round((stats.present/stats.total)*100 || 0)}%</div>
        </div>

        {/* Stats Row */}
        <div className="row g-2 mb-3">
            <div className="col-4"><div className="bg-light p-2 rounded-3 text-center border"><div className="h6 mb-0 fw-black text-success">{stats.present}</div><div className="xx-small fw-bold text-muted">PRESENT</div></div></div>
            <div className="col-4"><div className="bg-light p-2 rounded-3 text-center border"><div className="h6 mb-0 fw-black text-danger">{stats.absent}</div><div className="xx-small fw-bold text-muted">ABSENT</div></div></div>
            <div className="col-4"><div className="bg-light p-2 rounded-3 text-center border"><div className="h6 mb-0 fw-black text-warning">{stats.excused}</div><div className="xx-small fw-bold text-muted">EXCUSED</div></div></div>
        </div>

        {/* Search & Bulk Bar */}
        {Object.keys(pendingChanges).length > 0 && (
          <div className="d-flex justify-content-between align-items-center bg-warning bg-opacity-10 text-warning-emphasis p-3 rounded-4 mb-3 border border-warning border-opacity-50">
            <div className="d-flex align-items-center gap-2">
              <span className="fw-bold small">{Object.keys(pendingChanges).length} unsaved change(s)</span>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-light border fw-bold" onClick={() => setPendingChanges({})}>Discard</button>
              <button className="btn btn-sm btn-warning fw-bold px-3" onClick={handleSaveAttendance}>Save Changes</button>
            </div>
          </div>
        )}

        <div className="d-flex gap-2">
            <div className="modern-input-unified p-1 d-flex align-items-center bg-light shadow-inner flex-grow-1">
                <Search size={16} className="text-muted ms-2" />
                <input type="text" className="form-control border-0 bg-transparent py-1 small fw-bold" placeholder="Find student..." value={markSearch} onChange={e => setMarkSearch(e.target.value)} />
            </div>
            <div className="dropdown">
                <button className="btn btn-light border rounded-3 p-2 shadow-sm" type="button" data-bs-toggle="dropdown"><Settings2 size={20} /></button>
                <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-4 p-2">
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleBulkMark('present')}><UserCheck size={16} className="text-success" /> Mark All Present</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleBulkMark('absent')}><UserX size={16} className="text-danger" /> Mark All Absent</button></li>
                    <li><hr className="dropdown-divider" /></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 text-danger" onClick={handleResetRecords}><RotateCcw size={16} /> Reset Selection</button></li>
                    <li><hr className="dropdown-divider" /></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('csv')}><FileText size={16} className="text-success" /> Export CSV</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('xlsx')}><FileSpreadsheet size={16} className="text-primary" /> Export Excel</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('pdf')}><FileText size={16} className="text-danger" /> Export PDF</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('text')}><Download size={16} className="text-muted" /> Export Text</button></li>
                    <li><button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2" onClick={() => handleSessionExport('share')}><Share2 size={16} className="text-info" /> Share</button></li>
                </ul>
            </div>
        </div>
      </div>

      <div className="px-4 container-mobile d-flex flex-column gap-2">
        <AnimatePresence mode="popLayout">
          {displayedEnrollments.map((student: { serverId: string, name: string, regNumber: string }) => {
            const status = combinedRecords.get(student.serverId);
            return (
              <motion.div key={student.serverId} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card border-0 bg-white shadow-sm overflow-hidden rounded-4">
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-0 text-dark text-truncate text-uppercase small letter-spacing-n1">{student.name}</h6>
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <span className="xx-small fw-black text-muted font-monospace tracking-widest">{student.regNumber}</span>
                      {!status && (
                        <span className="badge rounded-2 fw-bold" style={{ fontSize: '7px', backgroundColor: 'var(--badge-muted-bg)', color: 'var(--badge-muted-text)', border: '1px dashed var(--badge-muted-border)' }}>UNMARKED</span>
                      )}
                    </div>
                  </div>
                  <div className="d-flex gap-1 bg-light p-1 rounded-3">
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'present' ? 'bg-success text-white shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.serverId, 'present')}><CheckCircle size={20} /></button>
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'absent' ? 'bg-danger text-white shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.serverId, 'absent')}><XCircle size={20} /></button>
                    <button className={`btn btn-sm border-0 rounded-2 p-2 transition-all ${status === 'excused' ? 'bg-warning text-dark shadow-sm scale-110' : 'bg-transparent text-muted'}`} onClick={() => updateRecord(student.serverId, 'excused')}><HelpCircle size={20} /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredEnrollments && filteredEnrollments.length > itemsPerStudentPage && (
          <div className="d-flex justify-content-between align-items-center mt-2 pb-2">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === 1} onClick={() => setStudentPage(p => Math.max(p - 1, 1))}>PREV</button>
            <span className="xx-small fw-black text-muted uppercase">Page {studentPage} of {totalStudentPages}</span>
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === totalStudentPages} onClick={() => setStudentPage(p => Math.min(p + 1, totalStudentPages))}>NEXT</button>
          </div>
        )}

        {enrollments?.length === 0 && (
          <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
            <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No students enrolled in this course</p>
          </div>
        )}

        {filteredEnrollments.length === 0 && enrollments && enrollments.length > 0 && (
          <div className="text-center py-5 opacity-50">
            <Search size={40} className="text-muted mb-2 mx-auto" />
            <p className="xx-small fw-black text-muted uppercase">No matches found for "{markSearch}"</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deletingSessionId !== null}
        title="Delete Session"
        message="Are you sure you want to delete this session? This action can be reversed by an administrator."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deletingSessionId && onDeleteSession(deletingSessionId)}
        onCancel={() => setDeletingSessionId(null)}
      />

      <ConfirmDialog
        open={confirmBulkMarkStatus !== null}
        title={`MARK ALL ${confirmBulkMarkStatus?.toUpperCase()}`}
        message={`Mark all ${filteredEnrollments.length} displayed student${filteredEnrollments.length !== 1 ? 's' : ''} as ${confirmBulkMarkStatus?.toUpperCase()}?`}
        confirmLabel="Mark All"
        variant={confirmBulkMarkStatus === 'present' ? 'primary' : 'danger'}
        onConfirm={async () => { const s = confirmBulkMarkStatus!; setConfirmBulkMarkStatus(null); await doBulkMark(s); }}
        onCancel={() => setConfirmBulkMarkStatus(null)}
      />

      <ConfirmDialog
        open={confirmResetRecords}
        title="CLEAR ATTENDANCE"
        message={`Clear attendance for the ${filteredEnrollments.length} displayed student${filteredEnrollments.length !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Clear"
        variant="danger"
        onConfirm={async () => { setConfirmResetRecords(false); await doResetRecords(); }}
        onCancel={() => setConfirmResetRecords(false)}
      />
    </div>
  );
}
