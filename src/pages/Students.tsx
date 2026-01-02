import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Trash2, Search, FileText, Upload, X } from 'lucide-react';
import { db, type Student } from '../db/db';

export default function Students() {
  const students = useLiveQuery(() => db.students.orderBy('name').toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Import Modes: 'manual' | 'paste' | 'csv'
  const [activeTab, setActiveTab] = useState<'manual' | 'paste' | 'csv'>('manual');
  
  // Data States
  const [pasteData, setPasteData] = useState('');
  const [parsedStudents, setParsedStudents] = useState<Student[]>([]);
  const [manualRows, setManualRows] = useState<{name: string, regNumber: string}[]>([{name: '', regNumber: ''}, {name: '', regNumber: ''}, {name: '', regNumber: ''}]);

  // --- CSV Logic ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const results: Student[] = [];
      
      // Simple CSV parser: assumes "Name, RegNumber" or "RegNumber, Name"
      lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(',');
        if (parts.length >= 2) {
          // Check which part looks like a reg number (digits)
          const p1 = parts[0].trim();
          const p2 = parts[1].trim();
          const regRegex = /\d{8,}/;
          
          if (regRegex.test(p2)) {
             results.push({ name: p1, regNumber: p2 });
          } else if (regRegex.test(p1)) {
             results.push({ name: p2, regNumber: p1 });
          }
        }
      });
      setParsedStudents(results);
    };
    reader.readAsText(file);
  };

  // --- Manual Logic ---
  const addManualRow = () => {
    setManualRows([...manualRows, {name: '', regNumber: ''}]);
  };
  
  const updateManualRow = (index: number, field: 'name' | 'regNumber', value: string) => {
    const newRows = [...manualRows];
    newRows[index][field] = value;
    setManualRows(newRows);
  };

  const removeManualRow = (index: number) => {
    if (manualRows.length > 1) {
      const newRows = [...manualRows];
      newRows.splice(index, 1);
      setManualRows(newRows);
    }
  };

  // --- Smart Paste Logic ---
  const handleParse = () => {
    const regNoRegex = /\b\d{10}\b/g;
    const matches = Array.from(pasteData.matchAll(regNoRegex));
    const results: Student[] = [];
    const lines = pasteData.split('\n');

    matches.forEach(match => {
      const regNumber = match[0];
      const line = lines.find(l => l.includes(regNumber)) || '';
      const name = line.replace(regNumber, '').replace(/[,,\t\d]/g, '').trim();
      if (name.length > 2) {
        results.push({ regNumber, name });
      } else {
        results.push({ regNumber, name: 'Unknown Student' });
      }
    });
    setParsedStudents(results);
  };

  // --- Save Logic ---
  const handleSave = async () => {
    try {
      let dataToSave: Student[] = [];
      
      if (activeTab === 'manual') {
        dataToSave = manualRows.filter(r => r.name.trim() && r.regNumber.trim());
      } else {
        dataToSave = parsedStudents;
      }

      if (dataToSave.length === 0) {
        alert('No valid students to save.');
        return;
      }

      for (const s of dataToSave) {
        const existing = await db.students.where('regNumber').equals(s.regNumber).first();
        if (!existing) {
          await db.students.add(s);
        } else {
          await db.students.update(existing.id!, { name: s.name });
        }
      }
      
      setShowImportModal(false);
      setPasteData('');
      setParsedStudents([]);
      setManualRows([{name: '', regNumber: ''}, {name: '', regNumber: ''}, {name: '', regNumber: ''}]);
      alert(`${dataToSave.length} students saved successfully!`);
    } catch (error) {
      console.error(error);
      alert('Save failed. Check console.');
    }
  };

  const filteredStudents = students?.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.regNumber.includes(searchTerm)
  );

  return (
    <div className="container-fluid animate-in">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <h1>Students</h1>
        <div className="d-flex gap-2">
          <button className="btn btn-primary d-flex align-items-center gap-2 shadow-sm" onClick={() => setShowImportModal(true)}>
            <Plus size={20} /> Add / Import Students
          </button>
        </div>
      </div>

      <div className="card shadow-sm border-0 mb-4 rounded-4 overflow-hidden">
        <div className="card-body p-0">
          <div className="p-3 border-bottom bg-light">
            <div className="input-group modern-input-unified bg-white">
              <span className="input-group-text border-0 bg-transparent"><Search size={18} className="text-muted" /></span>
              <input 
                type="text" 
                className="form-control border-0 bg-transparent"
                placeholder="Search by name or reg number..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light text-muted small text-uppercase">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th>Registration Number</th>
                  <th className="text-end px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents?.map(s => (
                  <tr key={s.id}>
                    <td className="px-4 fw-medium">{s.name}</td>
                    <td><span className="badge bg-light text-dark border fw-normal">{s.regNumber}</span></td>
                    <td className="text-end px-4">
                      <button className="btn btn-sm btn-light text-danger rounded-circle p-2" onClick={() => db.students.delete(s.id!)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredStudents?.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-5 text-muted">
                      No students found. Add some using the button above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Unified Add/Import Modal */} 
      {showImportModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-fullscreen-sm-down modal-xl modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content border-0 shadow-lg rounded-4">
                <div className="modal-header bg-white border-bottom-0 pb-0">
                  <div className="nav nav-pills w-100 gap-2" role="tablist">
                    <button 
                      className={`nav-link flex-fill ${activeTab === 'manual' ? 'active shadow-sm fw-bold' : 'text-muted'}`}
                      onClick={() => setActiveTab('manual')}
                    >
                      <Plus size={16} className="me-2" /> Manual
                    </button>
                    <button 
                      className={`nav-link flex-fill ${activeTab === 'paste' ? 'active shadow-sm fw-bold' : 'text-muted'}`}
                      onClick={() => setActiveTab('paste')}
                    >
                      <ClipboardPaste size={16} className="me-2" /> Smart Paste
                    </button>
                    <button 
                      className={`nav-link flex-fill ${activeTab === 'csv' ? 'active shadow-sm fw-bold' : 'text-muted'}`}
                      onClick={() => setActiveTab('csv')}
                    >
                      <FileText size={16} className="me-2" /> CSV Import
                    </button>
                  </div>
                  <button type="button" className="btn-close ms-2" onClick={() => setShowImportModal(false)}></button>
                </div>

                <div className="modal-body p-4 bg-light">
                  {/* Tab Content: Manual */} 
                  {activeTab === 'manual' && (
                    <div className="card border-0 shadow-sm rounded-4">
                      <div className="card-body">
                        <div className="table-responsive mb-3">
                          <table className="table table-borderless mb-0">
                            <thead className="text-muted small text-uppercase">
                              <tr>
                                <th>Full Name</th>
                                <th>Reg Number</th>
                                <th style={{width: '50px'}}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {manualRows.map((row, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <input 
                                      type="text" className="form-control bg-light border-0" placeholder="Student Name"
                                      value={row.name} onChange={e => updateManualRow(idx, 'name', e.target.value)}
                                    />
                                  </td>
                                  <td>
                                    <input 
                                      type="text" className="form-control bg-light border-0" placeholder="202XXXXXXX"
                                      value={row.regNumber} onChange={e => updateManualRow(idx, 'regNumber', e.target.value)}
                                    />
                                  </td>
                                  <td>
                                    <button className="btn btn-light text-danger rounded-circle" onClick={() => removeManualRow(idx)}>
                                      <X size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button className="btn btn-outline-primary w-100 border-dashed" onClick={addManualRow}>
                          <Plus size={16} className="me-2" /> Add Another Row
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab Content: Paste */} 
                  {activeTab === 'paste' && (
                    <div className="row h-100">
                      <div className="col-lg-5 mb-3 mb-lg-0">
                        <div className="card border-0 shadow-sm rounded-4 h-100">
                          <div className="card-body d-flex flex-column">
                            <label className="fw-bold mb-2">Paste Text</label>
                            <textarea 
                              className="form-control bg-light border-0 flex-grow-1 font-monospace small" 
                              placeholder="Paste names and reg numbers here..."
                              value={pasteData}
                              onChange={e => setPasteData(e.target.value)}
                            />
                            <button className="btn btn-primary mt-3 w-100" onClick={handleParse} disabled={!pasteData.trim()}>
                              Parse Data
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="col-lg-7">
                        <PreviewTable data={parsedStudents} setData={setParsedStudents} />
                      </div>
                    </div>
                  )}

                  {/* Tab Content: CSV */} 
                  {activeTab === 'csv' && (
                    <div className="row h-100">
                      <div className="col-lg-5 mb-3 mb-lg-0">
                        <div className="card border-0 shadow-sm rounded-4 h-100">
                          <div className="card-body text-center d-flex flex-column justify-content-center align-items-center p-5">
                            <div className="bg-primary-subtle p-4 rounded-circle mb-3 text-primary">
                              <Upload size={32} />
                            </div>
                            <h5 className="fw-bold">Upload CSV File</h5>
                            <p className="text-muted small mb-4">
                              File should contain columns for <strong>Name</strong> and <strong>Reg Number</strong>.
                            </p>
                            <input 
                              type="file" 
                              accept=".csv"
                              className="form-control"
                              onChange={handleFileUpload}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="col-lg-7">
                        <PreviewTable data={parsedStudents} setData={setParsedStudents} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-footer border-top-0">
                  <button type="button" className="btn btn-link text-muted text-decoration-none" onClick={() => setShowImportModal(false)}>Cancel</button>
                  <button type="button" className="btn btn-success px-5 rounded-pill shadow-sm fw-bold" onClick={handleSave}>
                    Save to Database
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}

// Helper Component for Preview Table
function PreviewTable({ data, setData }: { data: Student[], setData: (d: Student[]) => void }) {
  return (
    <div className="card border-0 shadow-sm rounded-4 h-100">
      <div className="card-header bg-white border-bottom-0 py-3">
        <h6 className="fw-bold mb-0">Preview Data ({data.length})</h6>
      </div>
      <div className="table-responsive flex-grow-1" style={{ maxHeight: '400px' }}>
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light small text-muted sticky-top">
            <tr>
              <th>Name</th>
              <th>Reg Number</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s, idx) => (
              <tr key={idx}>
                <td>
                  <input 
                    type="text" className="form-control form-control-sm border-0 bg-transparent"
                    value={s.name}
                    onChange={e => {
                      const newData = [...data];
                      newData[idx].name = e.target.value;
                      setData(newData);
                    }}
                  />
                </td>
                <td>{s.regNumber}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={2} className="text-center py-5 text-muted small">
                  No data parsed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
