import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, X, Search, CheckCircle2, Filter, Circle, UserMinus, UserPlus, Save, AlertCircle } from 'lucide-react';
import { db } from '../../db/db';
import type { Enrollment } from '../../db/db';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';
import ConfirmDialog from '../ConfirmDialog';

interface EnrollmentModalProps {
  show: boolean;
  courseId?: string;
  courseName?: string;
  onClose: () => void;
}

export default function EnrollmentModal({ show, courseId, courseName, onClose }: EnrollmentModalProps) {
  const { user } = useAuthStore();
  const [enrollSearch, setEnrollSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [enrollFilter, setEnrollFilter] = useState<'all' | 'enrolled' | 'not_enrolled'>('all');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(enrollSearch), 300);
    return () => clearTimeout(timer);
  }, [enrollSearch]);

  // Local Enrollment State (Pending Changes)
  const [localEnrollments, setLocalEnrollments] = useState<Set<string>>(new Set());
  const [originalEnrollments, setOriginalEnrollments] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [confirmCloseEnroll, setConfirmCloseEnroll] = useState(false);

  // Load Enrollments when Modal Opens
  useEffect(() => {
    if (show && courseId) {
      db.enrollments.where('courseId').equals(courseId).toArray().then(records => {
        const activeRecords = records.filter(r => r.isDeleted !== 1);
        const ids = new Set(activeRecords.map(e => e.studentId));
        setLocalEnrollments(ids);
        setOriginalEnrollments(new Set(ids));
      });
    } else {

      // setLocalEnrollments(new Set());

      // setOriginalEnrollments(new Set());
    }
  }, [show, courseId]);

  const isDirty = useMemo(() => {
    if (localEnrollments.size !== originalEnrollments.size) return true;
    for (const id of localEnrollments) {
      if (!originalEnrollments.has(id)) return true;
    }
    return false;
  }, [localEnrollments, originalEnrollments]);

  const allStudents = useLiveQuery(() => db.students.orderBy('name').filter(s => s.isDeleted !== 1).toArray());

  const filteredStudents = useMemo(() => {
    if (!allStudents) return [];

    return allStudents.filter(s => {
      const isEnrolled = localEnrollments.has(s.serverId);
      const matchesSearch = s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        s.regNumber.includes(debouncedSearch);
      const matchesFilter =
        enrollFilter === 'all' ? true :
          enrollFilter === 'enrolled' ? isEnrolled :
            !isEnrolled;
      return matchesSearch && matchesFilter;
    }).map(s => ({
      ...s,
      isEnrolled: localEnrollments.has(s.serverId)
    }));
  }, [allStudents, debouncedSearch, enrollFilter, localEnrollments]);

  const stats = {
    all: allStudents?.length || 0,
    enrolled: localEnrollments.size,
    notEnrolled: (allStudents?.length || 0) - localEnrollments.size
  };

  const areAllVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(s => s.isEnrolled);

  // Pagination for Enrollment Modal (Virtualization)
  const [modalPage, setModalPage] = useState(1);
  const modalItemsPerPage = 20;
  const totalModalPages = Math.ceil(filteredStudents.length / modalItemsPerPage);
  const displayedModalStudents = filteredStudents.slice((modalPage - 1) * modalItemsPerPage, modalPage * modalItemsPerPage);

  // Reset modal page when filters or search change
  useEffect(() => {

      // setModalPage(1);

  }, [debouncedSearch, enrollFilter]);

  const handleToggleLocal = (studentId: string) => {
    const newSet = new Set(localEnrollments);
    if (newSet.has(studentId)) newSet.delete(studentId);
    else newSet.add(studentId);
    setLocalEnrollments(newSet);
  };

  const handleBulkLocal = (targetState: boolean) => {
    const newSet = new Set(localEnrollments);
    filteredStudents.forEach(s => {
      if (targetState) newSet.add(s.serverId);
      else newSet.delete(s.serverId);
    });
    setLocalEnrollments(newSet);
  };

  const handleSaveChanges = async () => {
    if (!user || !courseId) return;
    setIsSaving(true);

    try {
      const toAddIds: string[] = [];
      const toRemoveIds: string[] = [];

      for (const id of localEnrollments) {
        if (!originalEnrollments.has(id)) toAddIds.push(id);
      }
      for (const id of originalEnrollments) {
        if (!localEnrollments.has(id)) toRemoveIds.push(id);
      }

      await db.transaction('rw', db.enrollments, async () => {
        // 1. Handle Removals (Bulk)
        if (toRemoveIds.length > 0) {
          const recordsToSoftDelete = await db.enrollments
            .where('courseId').equals(courseId)
            .filter(e => toRemoveIds.includes(e.studentId))
            .toArray();

          if (recordsToSoftDelete.length > 0) {
            await db.enrollments.bulkUpdate(
              recordsToSoftDelete.map(r => ({ key: r.id!, changes: { isDeleted: 1, synced: 0 } }))
            );
          }
        }

        // 2. Handle Additions (Bulk)
        if (toAddIds.length > 0) {
          // Check for existing tombstones to resurrect
          const existingTombstones = await db.enrollments
            .where('courseId').equals(courseId)
            .filter(e => toAddIds.includes(e.studentId))
            .toArray();

          const tombstoneStudentIds = new Set(existingTombstones.map(t => t.studentId));
          const brandNewStudentIds = toAddIds.filter(id => !tombstoneStudentIds.has(id));

          // Resurrect existing
          if (existingTombstones.length > 0) {
            await db.enrollments.bulkUpdate(
              existingTombstones.map(t => ({ key: t.id!, changes: { isDeleted: 0, synced: 0 } }))
            );
          }

          // Create brand new
          if (brandNewStudentIds.length > 0) {
            await db.enrollments.bulkAdd(
                brandNewStudentIds.map(studentId => ({
                  serverId: crypto.randomUUID(),
                  studentId,
                  courseId,
                  userId: user.id,
                  synced: 0,
                  isDeleted: 0
                } as Enrollment))
            );
          }
        }
      });

      const updatedRecords = await db.enrollments.where('courseId').equals(courseId).toArray();
      const activeRecords = updatedRecords.filter(r => r.isDeleted !== 1);
      const newIds = new Set(activeRecords.map(e => e.studentId));

      setLocalEnrollments(newIds);
      setOriginalEnrollments(new Set(newIds));
      toast.success('Changes saved successfully!');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseModal = () => {
    if (isDirty) {
      setConfirmCloseEnroll(true);
    } else {
      onClose();
    }
  };

  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} onClick={handleCloseModal}></div>
      <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-end animate-in" style={{ zIndex: 1050, pointerEvents: 'none' }}>
        <div className="bg-white h-100 shadow-lg d-flex flex-column" style={{ width: '100%', maxWidth: '400px', pointerEvents: 'auto' }}>
          {/* Header */}
          <div className="p-4 border-bottom d-flex align-items-center justify-content-between bg-white sticky-top">
            <div className="d-flex align-items-center gap-3">
              <button className="btn btn-light rounded-circle p-2" onClick={handleCloseModal}><ArrowLeft size={20} /></button>
              <div>
                <h5 className="fw-black mb-0 text-primary uppercase">MANAGE STUDENTS</h5>
                <p className="xx-small fw-bold text-muted mb-0">{courseName}</p>
              </div>
            </div>
            <button className="btn btn-light rounded-circle p-2" onClick={handleCloseModal}><X size={24} /></button>
          </div>

          {/* Stats Bar */}
          <div className="bg-light px-4 py-3 d-flex justify-content-between align-items-center border-bottom">
            <div className="text-center">
              <h6 className="fw-black mb-0 text-dark">{stats.all}</h6>
              <div className="xx-small fw-bold text-muted uppercase">Total</div>
            </div>
            <div className="vr opacity-25"></div>
            <div className="text-center">
              <h6 className="fw-black mb-0 text-success">{stats.enrolled}</h6>
              <div className="xx-small fw-bold text-muted uppercase">Enrolled</div>
            </div>
            <div className="vr opacity-25"></div>
            <div className="text-center">
              <h6 className="fw-black mb-0 text-danger">{stats.notEnrolled}</h6>
              <div className="xx-small fw-bold text-muted uppercase">Not Enrolled</div>
            </div>
          </div>

          {/* Controls */}
          <div className="p-3 bg-white border-bottom sticky-top" style={{ top: '80px', zIndex: 1020 }}>
            {/* Tabs */}
            <div className="d-flex p-1 bg-light rounded-3 mb-3">
              <button className={`btn btn-sm flex-grow-1 fw-bold rounded-2 py-2 small ${enrollFilter === 'all' ? 'bg-white shadow-sm text-primary' : 'text-muted'}`} onClick={() => setEnrollFilter('all')}>All</button>
              <button className={`btn btn-sm flex-grow-1 fw-bold rounded-2 py-2 small ${enrollFilter === 'enrolled' ? 'bg-white shadow-sm text-success' : 'text-muted'}`} onClick={() => setEnrollFilter('enrolled')}>Enrolled</button>
              <button className={`btn btn-sm flex-grow-1 fw-bold rounded-2 py-2 small ${enrollFilter === 'not_enrolled' ? 'bg-white shadow-sm text-danger' : 'text-muted'}`} onClick={() => setEnrollFilter('not_enrolled')}>Not Enrolled</button>
            </div>

            {/* Search */}
            <div className="modern-input-unified p-1 d-flex align-items-center bg-white shadow-inner">
              <Search size={18} className="text-muted ms-2" />
              <input type="text" className="form-control border-0 bg-transparent py-2 small fw-bold" placeholder="Search students..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} />
            </div>
          </div>

          {/* List */}
          <div className="flex-grow-1 overflow-auto bg-white">
            {displayedModalStudents.length === 0 ? (
              <div className="h-100 d-flex flex-column align-items-center justify-content-center p-4 text-center opacity-50">
                {enrollFilter === 'not_enrolled' && stats.notEnrolled === 0 ? (
                  <>
                    <CheckCircle2 size={48} className="text-success mb-3" />
                    <h6 className="fw-black">ALL STUDENTS ENROLLED!</h6>
                    <p className="small text-muted">Great job, everyone is in.</p>
                  </>
                ) : (
                  <>
                    <Filter size={48} className="text-muted mb-3" />
                    <h6 className="fw-black">NO STUDENTS FOUND</h6>
                    <p className="small text-muted">Try adjusting your search or filters.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="list-group list-group-flush">
                {displayedModalStudents.map(student => (
                  <div key={student.serverId} className="list-group-item p-3 d-flex justify-content-between align-items-center border-0 border-bottom" style={{ backgroundColor: student.isEnrolled ? 'rgba(0,105,148,0.03)' : 'transparent' }}>
                    <div className="d-flex align-items-center gap-3 overflow-hidden">
                      <div className={`p-1 rounded-circle ${student.isEnrolled ? 'text-success' : 'text-muted opacity-25'}`}>
                        {student.isEnrolled ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                      </div>
                      <div className="overflow-hidden">
                        <div className="fw-bold small text-dark text-truncate">{student.name}</div>
                        <div className="xx-small fw-bold text-muted font-monospace">{student.regNumber}</div>
                      </div>
                    </div>
                    <button
                      className={`btn btn-sm fw-bold rounded-pill px-3 py-1 d-flex align-items-center gap-1 ${student.isEnrolled ? 'btn-outline-danger border-0 bg-danger-subtle text-danger' : 'btn-outline-primary border-0 bg-primary-subtle text-primary'}`}
                      onClick={() => handleToggleLocal(student.serverId)}
                    >
                      {student.isEnrolled ? <><UserMinus size={14} /> Remove</> : <><UserPlus size={14} /> Enroll</>}
                    </button>
                  </div>
                ))}

                {/* Modal Pagination Controls */}
                {totalModalPages > 1 && (
                  <div className="p-3 bg-light d-flex justify-content-between align-items-center border-top">
                    <button className="btn btn-white border btn-sm fw-bold px-3" disabled={modalPage === 1} onClick={() => setModalPage(p => Math.max(p - 1, 1))}>PREV</button>
                    <span className="xx-small fw-black text-muted uppercase">Page {modalPage} of {totalModalPages}</span>
                    <button className="btn btn-white border btn-sm fw-bold px-3" disabled={modalPage === totalModalPages} onClick={() => setModalPage(p => Math.min(p + 1, totalModalPages))}>NEXT</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky Action Footer */}
          <div className="p-4 bg-white border-top shadow-lg sticky-bottom">
            {isDirty ? (
              <div className="d-flex flex-column gap-2 animate-in">
                <div className="d-flex align-items-center gap-2 text-warning mb-1">
                  <AlertCircle size={16} />
                  <span className="xx-small fw-bold">You have unsaved changes</span>
                </div>
                <button
                  className="btn btn-success w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2"
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                >
                  {isSaving ? <div className="spinner-border spinner-border-sm" /> : <><Save size={20} /> SAVE CHANGES</>}
                </button>
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {/* Contextual Bulk Actions */}
                {enrollFilter === 'not_enrolled' && stats.notEnrolled > 0 && (
                  <button className="btn btn-primary w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" onClick={() => handleBulkLocal(true)}>
                    <CheckCircle2 size={20} /> ENROLL ALL SHOWN ({filteredStudents.length})
                  </button>
                )}
                {enrollFilter === 'enrolled' && stats.enrolled > 0 && (
                  <button className="btn btn-outline-danger w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" onClick={() => handleBulkLocal(false)}>
                    <UserMinus size={20} /> REMOVE ALL SHOWN ({filteredStudents.length})
                  </button>
                )}
                {enrollFilter === 'all' && (
                  <button className={`btn w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2 ${areAllVisibleSelected ? 'btn-outline-danger' : 'btn-primary'}`} onClick={() => handleBulkLocal(!areAllVisibleSelected)}>
                    {areAllVisibleSelected ? <><UserMinus size={20} /> REMOVE ALL SHOWN</> : <><CheckCircle2 size={20} /> ENROLL ALL SHOWN</>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCloseEnroll}
        title="Unsaved Changes"
        message="You have unsaved enrollment changes. Are you sure you want to close without saving?"
        confirmLabel="Discard Changes"
        variant="warning"
        onConfirm={() => { setConfirmCloseEnroll(false); onClose(); }}
        onCancel={() => setConfirmCloseEnroll(false)}
      />
    </>
  );
}
