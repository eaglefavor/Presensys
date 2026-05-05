import { Plus, Calendar, ArrowLeft, Clock, Pencil, Check, Trash2, ChevronRight, UserRound } from 'lucide-react';
import type { LocalAttendanceSession, LocalCourse } from '../../db/db';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';

interface SessionsListProps {
  sessions: LocalAttendanceSession[] | undefined;
  selectedCourse: LocalCourse | undefined;
  renamingSessionId: string | null;
  deletingSessionId: string | null;
  renameValue: string;
  onClearSelectedCourse: () => void;
  onCreateSession: (lecturerId: string) => void;
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
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedLecturerId, setSelectedLecturerId] = useState('');
  const [lecturerSearch, setLecturerSearch] = useState('');
  const [filterLecturerId, setFilterLecturerId] = useState('');
  const lecturers = useLiveQuery(() => db.lecturers.filter(l => l.isDeleted !== 1).toArray(), []) || [];

  const lecturerMap = useMemo(() => new Map(lecturers.map(l => [l.serverId, l.name])), [lecturers]);

  const courseAssignedLecturerIds = useMemo(() => {
    if (!selectedCourse?.lecturers) return null;
    const ids = selectedCourse.lecturers.split(',').map(s => s.trim()).filter(Boolean);
    return ids.length > 0 ? new Set(ids) : null;
  }, [selectedCourse]);

  const filteredLecturers = useMemo(() => {
    const base = courseAssignedLecturerIds
      ? lecturers.filter(l => courseAssignedLecturerIds.has(l.serverId))
      : lecturers;
    return base.filter(l => l.name.toLowerCase().includes(lecturerSearch.toLowerCase()));
  }, [lecturers, courseAssignedLecturerIds, lecturerSearch]);

  const displayedSessions = useMemo(() => {
    if (!sessions) return [];
    if (!filterLecturerId) return sessions;
    return sessions.filter(s => s.lecturerId === filterLecturerId);
  }, [sessions, filterLecturerId]);

  const handleStartSession = () => {
    if (!selectedLecturerId) return;
    onCreateSession(selectedLecturerId);
    setShowStartModal(false);
    setSelectedLecturerId('');
    setLecturerSearch('');
  };

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
        <button className="btn btn-primary w-100 py-3 rounded-pill fw-black shadow-lg d-flex align-items-center justify-content-center gap-2 text-uppercase letter-spacing-n1" onClick={() => setShowStartModal(true)}>
          <Plus size={20} /> START NEW SESSION
        </button>
      </div>
      <div className="px-4 container-mobile">
        {/* Lecturer filter */}
        {lecturers.length > 0 && (
          <div className="mb-3">
            <select
              className="form-select form-select-sm rounded-3 fw-bold border-light bg-white shadow-sm"
              value={filterLecturerId}
              onChange={e => setFilterLecturerId(e.target.value)}
            >
              <option value="">All Lecturers</option>
              {lecturers.map(l => (
                <option key={l.serverId} value={l.serverId}>{l.name}</option>
              ))}
            </select>
          </div>
        )}

        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 ps-1">
          {filterLecturerId ? `Sessions — ${lecturerMap.get(filterLecturerId) || 'Lecturer'}` : 'Recent Sessions'}
        </h6>
        <div className="d-flex flex-column gap-2">
          {displayedSessions.map(session => (
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
                    <div className="xx-small fw-bold text-muted text-uppercase d-flex align-items-center gap-1 mt-1">
                      <Clock size={10} /> {new Date(session.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      {session.lecturerId && lecturerMap.has(session.lecturerId) && (
                        <span className="d-flex align-items-center gap-1 ms-2">
                          <UserRound size={10} /> {lecturerMap.get(session.lecturerId)}
                        </span>
                      )}
                    </div>
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
          {displayedSessions.length === 0 && (
            <div className="text-center py-5 bg-white rounded-4 border-dashed">
              <p className="xx-small fw-bold text-muted uppercase">
                {filterLecturerId ? 'No sessions found for this lecturer' : 'No sessions found'}
              </p>
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

      {showStartModal && (
        <div className="modal-backdrop show bg-dark bg-opacity-75" style={{ zIndex: 1040 }} />
      )}
      <div className={`modal fade ${showStartModal ? 'show d-block' : ''}`} tabIndex={-1} style={{ zIndex: 1050 }}>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
            <div className="modal-header border-0 bg-light pb-0 pt-4 px-4 d-flex justify-content-between align-items-center">
              <div>
                <h5 className="modal-title fw-black text-dark text-uppercase letter-spacing-n1">Start Session</h5>
                <p className="xx-small fw-bold text-muted uppercase tracking-widest mb-0">Who is taking this lecture?</p>
              </div>
              <button type="button" className="btn-close shadow-none" onClick={() => setShowStartModal(false)}></button>
            </div>
            <div className="modal-body p-4">
              <input
                type="text"
                className="form-control rounded-3 mb-3"
                placeholder="Search lecturer..."
                value={lecturerSearch}
                onChange={e => setLecturerSearch(e.target.value)}
              />
              <div className="d-flex flex-column gap-2" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {filteredLecturers.map(lecturer => (
                  <div
                    key={lecturer.serverId}
                    className={`card border-0 p-3 rounded-3 cursor-pointer ${selectedLecturerId === lecturer.serverId ? 'bg-primary bg-opacity-10 border-primary border text-primary' : 'bg-light text-dark'}`}
                    onClick={() => setSelectedLecturerId(lecturer.serverId)}
                  >
                    <h6 className="mb-0 fw-bold small">{lecturer.name}</h6>
                  </div>
                ))}
                {filteredLecturers.length === 0 && (
                   <p className="text-center text-muted small py-3 mb-0">No lecturers found.</p>
                )}
              </div>
            </div>
            <div className="modal-footer border-0 p-4 pt-0">
              <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold small" onClick={() => setShowStartModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary flex-grow-1 py-3 rounded-3 shadow-lg fw-bold" disabled={!selectedLecturerId} onClick={handleStartSession}>START</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

