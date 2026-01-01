import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Trash2, Search, UserCheck } from 'lucide-react';
import { db, type Student } from '../db/db';

export default function Students() {
  const students = useLiveQuery(() => db.students.orderBy('name').toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [parsedStudents, setParsedStudents] = useState<Student[]>([]);

  // Simple parser: looks for 10-digit reg numbers and surrounding text as names
  const handleParse = () => {
    // UNIZIK Reg Nos are usually 10 digits (e.g., 2020123456)
    const regNoRegex = /\b\d{10}\b/g;
    const matches = Array.from(pasteData.matchAll(regNoRegex));
    
    const results: Student[] = [];
    const lines = pasteData.split('\n');

    matches.forEach(match => {
      const regNumber = match[0];
      
      
      // Look for the name: check current line, or surrounding context
      // This is a naive implementation that can be refined
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

  const handleSaveImport = async () => {
    try {
      // Use bulkPut to avoid duplicates (regNumber is indexed and unique in schema if we used it as key)
      // Since 'id' is the key, we should check for existing regNumbers
      for (const s of parsedStudents) {
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
      alert('Students imported successfully!');
    } catch (error) {
      console.error(error);
      alert('Import failed. Check console.');
    }
  };

  const filteredStudents = students?.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.regNumber.includes(searchTerm)
  );

  return (
    <div className="container-fluid">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <h1>Students</h1>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary d-flex align-items-center gap-2" onClick={() => setShowImportModal(true)}>
            <ClipboardPaste size={20} /> Smart Paste
          </button>
          <button className="btn btn-primary d-flex align-items-center gap-2">
            <Plus size={20} /> Add Student
          </button>
        </div>
      </div>

      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body p-0">
          <div className="p-3 border-bottom">
            <div className="input-group">
              <span className="input-group-text bg-white border-end-0"><Search size={18} className="text-muted" /></span>
              <input 
                type="text" 
                className="form-control border-start-0 ps-0" 
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
                    <td><code className="bg-light px-2 py-1 rounded text-dark">{s.regNumber}</code></td>
                    <td className="text-end px-4">
                      <button className="btn btn-sm btn-light text-danger" onClick={() => db.students.delete(s.id!)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredStudents?.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-5 text-muted">
                      No students found. Use "Smart Paste" to import from a list.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-fullscreen-sm-down modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content border-0 shadow-lg">
                <div className="modal-header bg-primary text-white">
                  <h5 className="modal-title d-flex align-items-center gap-2">
                    <ClipboardPaste size={20} /> Smart Student Importer
                  </h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowImportModal(false)}></button>
                </div>
                <div className="modal-body p-4">
                  <div className="row">
                    <div className="col-12 mb-4">
                      <label className="form-label fw-bold">Paste Student List</label>
                      <p className="small text-muted">Paste your text from WhatsApp, PDF, or Excel here. We will try to extract names and 10-digit reg numbers.</p>
                      <textarea 
                        className="form-control mb-3 font-monospace"
                        rows={12}
                        value={pasteData}
                        onChange={e => setPasteData(e.target.value)}
                        placeholder="John Doe 2020123456&#10;Jane Smith 2020654321..."
                      />
                      <button className="btn btn-primary w-100" onClick={handleParse} disabled={!pasteData.trim()}>
                        Process List
                      </button>
                    </div>
                    <div className="col-12">
                      <label className="form-label fw-bold">Preview ({parsedStudents.length} students found)</label>
                      <div className="table-responsive border rounded" style={{ maxHeight: '400px' }}>
                        <table className="table table-sm table-striped mb-0">
                          <thead className="table-light sticky-top">
                            <tr>
                              <th>Reg Number</th>
                              <th>Name</th>
                              <th className="text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedStudents.map((s, idx) => (
                              <tr key={idx}>
                                <td>{s.regNumber}</td>
                                <td>
                                  <input 
                                    type="text" 
                                    className="form-control form-control-sm"
                                    value={s.name}
                                    onChange={e => {
                                      const newParsed = [...parsedStudents];
                                      newParsed[idx].name = e.target.value;
                                      setParsedStudents(newParsed);
                                    }}
                                  />
                                </td>
                                <td className="text-center text-success"><UserCheck size={16} /></td>
                              </tr>
                            ))}
                            {parsedStudents.length === 0 && (
                              <tr>
                                <td colSpan={3} className="text-center py-5 text-muted">
                                  Parsing results will appear here.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light">
                  <button type="button" className="btn btn-link text-muted" onClick={() => setShowImportModal(false)}>Cancel</button>
                  <button 
                    type="button" 
                    className="btn btn-success px-4"
                    disabled={parsedStudents.length === 0}
                    onClick={handleSaveImport}
                  >
                    Confirm & Save to Database
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