import { Plus, Calendar, ArrowLeft, Clock, Pencil, Check, Trash2, ChevronRight } from 'lucide-react';
import type { LocalAttendanceSession, LocalCourse } from '../../db/db';
import ConfirmDialog from '../../components/ConfirmDialog';

interface SessionsListProps {
  sessions: LocalAttendanceSession[] | undefined;
  selectedCourse: LocalCourse | undefined;
  renamingSessionId: string | null;
  deletingSessionId: string | null;
  renameValue: string;
  onClearSelectedCourse: () => void;
  onCreateSession: () => void;
  onRenameSession: () => void;
  onDeleteSession: (id: string) => void;
  onSessionSelect: (id: string) => void;
  setRenamingSessionId: (id: string | null) => void;
  setDeletingSessionId: (id: string | null) => void;
  setRenameValue: (val: string) => void;
}

export default function SessionsList({
  sessions,
  selectedCourse,
  renamingSessionId,
  deletingSessionId,
  renameValue,
  onClearSelectedCourse,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onSessionSelect,
  setRenamingSessionId,
  setDeletingSessionId,
  setRenameValue
}: SessionsListProps) {
  return (
    <div className="attendance-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex align-items-center gap-3 mb-4">
          <button className="btn btn-light rounded-circle p-2 shadow-sm" onClick={onClearSelectedCourse}><ArrowLeft size={20} /></button>
          <div>
            <h1 className="h5 fw-black mb-0 text-dark text-uppercase letter-spacing-n1">{selectedCourse?.code}</h1>
            <p className="xx-small fw-bold text-muted mb-0 text-uppercase tracking-widest">Attendance Feed</p>
          </div>
        </div>
        <button className="btn btn-primary w-100 py-3 rounded-pill fw-black shadow-lg d-flex align-items-center justify-content-center gap-2 text-uppercase letter-spacing-n1" onClick={onCreateSession}>
          <Plus size={20} /> START NEW SESSION
        </button>
      </div>
      <div className="px-4 container-mobile">
        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 ps-1">Recent Sessions</h6>
        <div className="d-flex flex-column gap-2">
          {sessions?.map(session => (
            <div key={session.serverId} className="card border-0 bg-white shadow-sm rounded-4">
              {renamingSessionId === session.serverId ? (
                <div className="p-3 d-flex align-items-center gap-2">
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
                <div className="p-3 d-flex flex-row align-items-center gap-3 cursor-pointer active-scale" onClick={() => onSessionSelect(session.serverId)}>
                  <div className="bg-light text-primary p-2 rounded-2"><Calendar size={20} /></div>
                  <div className="flex-grow-1">
                    <h6 className="fw-bold mb-0 text-dark text-uppercase small">{session.title}</h6>
                    <div className="xx-small fw-bold text-muted text-uppercase d-flex align-items-center gap-1 mt-1"><Clock size={10} /> {new Date(session.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
                  </div>
                  <button
                    className="btn btn-light btn-sm rounded-circle p-1 border-0 text-muted me-1"
                    style={{ width: 30, height: 30 }}
                    onClick={e => { e.stopPropagation(); setRenameValue(session.title); setRenamingSessionId(session.serverId); }}
                    title="Rename session"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-light btn-sm rounded-circle p-1 border-0 text-danger me-1"
                    style={{ width: 30, height: 30 }}
                    onClick={e => { e.stopPropagation(); setDeletingSessionId(session.serverId); }}
                    title="Delete session"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={16} className="text-muted opacity-50" />
                </div>
              )}
            </div>
          ))}
          {sessions?.length === 0 && (
            <div className="text-center py-5 bg-white rounded-4 border-dashed">
              <p className="xx-small fw-bold text-muted uppercase">No sessions found</p>
            </div>
          )}
          <ConfirmDialog
            open={deletingSessionId !== null}
            title="Delete Session"
            message="Are you sure you want to delete this session? This action can be reversed by an administrator."
            confirmLabel="Delete"
            cancelLabel="Cancel"
            onConfirm={() => deletingSessionId && onDeleteSession(deletingSessionId)}
            onCancel={() => setDeletingSessionId(null)}
          />
        </div>
      </div>
    </div>
  );
}
