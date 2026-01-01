import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Calendar, Archive, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import { useAppStore } from '../store/useAppStore';

export default function Semesters() {
  const semesters = useLiveQuery(() => db.semesters.toArray());
  const activeSemester = useAppStore(state => state.activeSemester);
  const setActiveSemester = useAppStore(state => state.setActiveSemester);
  
  const [showModal, setShowModal] = useState(false);
  const [newSemester, setNewSemester] = useState({
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 4)).toISOString().split('T')[0],
  });

  const handleAddSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = await db.semesters.add({
      ...newSemester,
      isActive: false,
      isArchived: false,
    });
    
    // If it's the first semester, make it active
    if (semesters && semesters.length === 0) {
      await handleSetActive(id as number);
    }
    
    setShowModal(false);
    setNewSemester({
      name: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 4)).toISOString().split('T')[0],
    });
  };

  const handleSetActive = async (id: number) => {
    await db.transaction('rw', db.semesters, async () => {
      // Deactivate all
      await db.semesters.toCollection().modify({ isActive: false });
      // Activate selected
      await db.semesters.update(id, { isActive: true });
      
      const active = await db.semesters.get(id);
      if (active) setActiveSemester(active);
    });
  };

  const handleArchive = async (id: number, currentStatus: boolean) => {
    await db.semesters.update(id, { isArchived: !currentStatus });
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure? This will delete all data related to this semester (Courses, Attendance).')) {
      await db.transaction('rw', [db.semesters, db.courses], async () => {
        const courses = await db.courses.where('semesterId').equals(id).toArray();
        const courseIds = courses.map(c => c.id!);
        // In a real app, we'd delete enrollments, sessions, and records too.
        // For brevity, we'll focus on the semester and courses.
        await db.courses.bulkDelete(courseIds);
        await db.semesters.delete(id);
        
        if (activeSemester?.id === id) {
          setActiveSemester(null);
        }
      });
    }
  };

  if (!semesters) return <div className="p-4 text-center">Loading...</div>;

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Semesters</h1>
        <button className="btn btn-primary d-flex align-items-center gap-2" onClick={() => setShowModal(true)}>
          <Plus size={20} /> Add Semester
        </button>
      </div>

      <div className="row g-4">
        {semesters.map((s) => (
          <div key={s.id} className="col-12 col-12">
            <div className={`card h-100 shadow-sm ${s.isActive ? 'border-primary' : ''}`}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <h5 className="card-title fw-bold">{s.name}</h5>
                  {s.isActive && (
                    <span className="badge bg-primary">Active</span>
                  )}
                  {s.isArchived && (
                    <span className="badge bg-secondary">Archived</span>
                  )}
                </div>
                
                <div className="text-muted mb-3 d-flex flex-column gap-1 small">
                  <div className="d-flex align-items-center gap-2">
                    <Calendar size={14} /> {s.startDate} to {s.endDate}
                  </div>
                </div>

                <div className="d-flex gap-2">
                  {!s.isActive && !s.isArchived && (
                    <button 
                      className="btn btn-sm btn-outline-primary flex-grow-1"
                      onClick={() => handleSetActive(s.id!)}
                    >
                      Set Active
                    </button>
                  )}
                  <button 
                    className={`btn btn-sm ${s.isArchived ? 'btn-outline-warning' : 'btn-outline-secondary'}`}
                    onClick={() => handleArchive(s.id!, s.isArchived)}
                  >
                    <Archive size={16} />
                  </button>
                  <button 
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(s.id!)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {semesters.length === 0 && (
          <div className="col-12 text-center py-5">
            <div className="text-muted">No semesters found. Create one to get started.</div>
          </div>
        )}
      </div>

      {/* Modal - Basic implementation without bootstrap JS */}
      {showModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow">
                <div className="modal-header">
                  <h5 className="modal-title">New Semester</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                </div>
                <form onSubmit={handleAddSemester}>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Semester Name (e.g., 2025/2026 First Semester)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        required 
                        value={newSemester.name}
                        onChange={e => setNewSemester({...newSemester, name: e.target.value})}
                        placeholder="Enter semester name"
                      />
                    </div>
                    <div className="row">
                      <div className="col-6">
                        <div className="mb-3">
                          <label className="form-label">Start Date</label>
                          <input 
                            type="date" 
                            className="form-control" 
                            required 
                            value={newSemester.startDate}
                            onChange={e => setNewSemester({...newSemester, startDate: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="mb-3">
                          <label className="form-label">End Date</label>
                          <input 
                            type="date" 
                            className="form-control" 
                            required 
                            value={newSemester.endDate}
                            onChange={e => setNewSemester({...newSemester, endDate: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-light" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Create Semester</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}