import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, UserRound, Pencil, Trash2, Check } from 'lucide-react';
import { db } from '../db/db';
import { OVERLAY_COLORS } from '../lib/themeColors';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Lecturers() {
  const { user } = useAuthStore();
  const lecturers = useLiveQuery(() => db.lecturers.filter(l => l.isDeleted !== 1).toArray(), []) || [];

  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ id: 0, serverId: crypto.randomUUID(), name: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.name.trim()) return;
    if (isEditing) {
      await db.lecturers.update(form.id, { name: form.name.trim() });
      toast.success('Lecturer updated.');
    } else {
      const existing = await db.lecturers.filter(l => l.isDeleted !== 1 && l.name.toLowerCase() === form.name.trim().toLowerCase()).first();
      if (existing) { toast.error('A lecturer with this name already exists.'); return; }
      await db.lecturers.add({
        serverId: crypto.randomUUID(),
        name: form.name.trim(),
        userId: user.id,
        synced: 0,
        isDeleted: 0,
      });
      toast.success('Lecturer added.');
    }
    setShowAddModal(false);
    setIsEditing(false);
    setForm({ id: 0, serverId: crypto.randomUUID(), name: '' });
  };

  const handleEditClick = (id: number, serverId: string, name: string) => {
    setForm({ id, serverId: serverId as ReturnType<typeof crypto.randomUUID>, name });
    setIsEditing(true);
    setShowAddModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (confirmDeleteId === null) return;
    await db.lecturers.update(confirmDeleteId, { isDeleted: 1 });
    toast.success('Lecturer removed.');
    setConfirmDeleteId(null);
  };

  const handleInlineRename = async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    const lecturer = await db.lecturers.where('serverId').equals(renamingId).first();
    if (lecturer) await db.lecturers.update(lecturer.id!, { name: renameValue.trim() });
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <div className="animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h1 className="h4 fw-black mb-0 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>LECTURERS</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Manage academic staff</p>
          </div>
          <button
            className="btn btn-primary rounded-circle p-3 shadow-lg d-flex align-items-center justify-content-center"
            style={{ width: '52px', height: '52px' }}
            onClick={() => { setIsEditing(false); setForm({ id: 0, serverId: crypto.randomUUID(), name: '' }); setShowAddModal(true); }}
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="px-4 container-mobile">
        {lecturers.length === 0 ? (
          <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
            <div className="bg-light d-inline-block p-4 rounded-circle mb-3">
              <UserRound size={40} className="text-muted opacity-25" />
            </div>
            <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No lecturers added yet</p>
            <p className="small text-muted mt-2">Add lecturers to tag attendance sessions to specific academics.</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="d-flex flex-column gap-2">
              {lecturers.map(lecturer => (
                <motion.div key={lecturer.serverId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                  <div className="card border-0 bg-white shadow-sm rounded-4">
                    {renamingId === lecturer.serverId ? (
                      <div className="p-3 d-flex align-items-center gap-2">
                        <input
                          className="form-control form-control-sm rounded-3 fw-bold border-primary"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleInlineRename(); if (e.key === 'Escape') setRenamingId(null); }}
                          autoFocus
                        />
                        <button className="btn btn-primary btn-sm rounded-3 px-3 fw-bold" onClick={handleInlineRename} aria-label="Save lecturer name"><Check size={14} /></button>
                        <button className="btn btn-light btn-sm rounded-3 px-3 fw-bold border" onClick={() => setRenamingId(null)} aria-label="Cancel rename">✕</button>
                      </div>
                    ) : (
                      <div className="card-body p-3 d-flex align-items-center gap-3">
                        <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3 flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: '48px', height: '48px' }}>
                          <UserRound size={22} />
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                          <h6 className="fw-black mb-0 text-dark text-truncate text-uppercase letter-spacing-n1">{lecturer.name}</h6>
                        </div>
                        <div className="d-flex gap-1">
                            <button
                              className="btn btn-light btn-sm rounded-circle p-1 border-0 text-muted"
                              style={{ width: 30, height: 30 }}
                              title="Edit"
                              aria-label="Edit lecturer"
                              onClick={() => handleEditClick(lecturer.id!, lecturer.serverId, lecturer.name)}
                            >
                            <Pencil size={13} />
                          </button>
                            <button
                              className="btn btn-light btn-sm rounded-circle p-1 border-0 text-danger"
                              style={{ width: 30, height: 30 }}
                              title="Delete"
                              aria-label="Delete lecturer"
                              onClick={() => setConfirmDeleteId(lecturer.id!)}
                            >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: OVERLAY_COLORS.backdrop, backdropFilter: 'blur(4px)', zIndex: 1050 }}>
          <motion.div className="modal-dialog modal-dialog-centered px-3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-content border-0 shadow-2xl rounded-4">
              <div className="modal-header border-bottom-0 p-4 pb-0">
                <h5 className="fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>{isEditing ? 'EDIT LECTURER' : 'NEW LECTURER'}</h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)} />
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body p-4">
                  <label className="xx-small fw-bold text-muted ps-1 mb-1 d-block">FULL NAME / TITLE</label>
                  <div className="modern-input-unified p-1">
                    <input
                      type="text"
                      className="form-control border-0 bg-transparent fw-bold"
                      placeholder="e.g. Dr. Okafor"
                      required
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 pt-0">
                  <button type="button" className="btn btn-link text-muted text-decoration-none fw-bold small" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary flex-grow-1 py-3 rounded-3 shadow-lg fw-bold">{isEditing ? 'SAVE CHANGES' : 'ADD LECTURER'}</button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Remove Lecturer"
        message="Remove this lecturer? Existing attendance sessions tagged to them will retain the association, but the name will no longer appear in new session dropdowns."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
