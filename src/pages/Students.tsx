import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Trash2, Search, FileText, Upload, X, AlertTriangle, ScanLine } from 'lucide-react';
import { db, type Student } from '../db/db';
import FileMapper from '../components/FileMapper';
import BarcodeScanner from '../components/BarcodeScanner';

export default function Students() {
  const students = useLiveQuery(() => db.students.orderBy('name').toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Import Modes: 'manual' | 'paste' | 'file'
  const [activeTab, setActiveTab] = useState<'manual' | 'paste' | 'file'>('manual');
  
  // Data States
  const [pasteData, setPasteData] = useState('');
  const [parsedStudents, setParsedStudents] = useState<Student[]>([]);
  const [manualRows, setManualRows] = useState<{name: string, regNumber: string}[]>([{name: '', regNumber: ''}]);
  
  // File Upload State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showMapper, setShowMapper] = useState(false);
  
  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [activeScanRowIndex, setActiveScanRowIndex] = useState<number | null>(null);

  // --- Scanner Logic ---
  const handleScanClick = (index: number) => {
    setActiveScanRowIndex(index);
    setShowScanner(true);
  };

  const handleScanSuccess = (decodedText: string) => {
    if (activeScanRowIndex !== null) {
        updateManualRow(activeScanRowIndex, 'regNumber', decodedText);
    }
    setShowScanner(false);
    setActiveScanRowIndex(null);
  };

  // --- File Upload Logic ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setShowMapper(true);
    }
  };

  const handleMapperComplete = (data: { name: string; regNumber: string }[]) => {
    setParsedStudents(data);
    setShowMapper(false);
    setUploadedFile(null);
    // Switch to preview view (reuse the paste tab view effectively)
    setActiveTab('paste'); 
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

  // --- Smart Paste Logic V2 (Robust) ---
  const handleParse = () => {
    const results: Student[] = [];
    const lines = pasteData.split('\n');
    const regNoRegex = /(\d{8,})/; // Corrected: escaped backslash for regex

    lines.forEach(line => {
      if (!line.trim()) return; 
      const match = line.match(regNoRegex);
      if (match) {
        const regNumber = match[0];
        // Remove the reg number and common separators from the line to get the name
        let name = line.replace(regNumber, '').replace(/[,\t]/g, '').trim(); // Corrected: escaped backslash for regex
        // Remove leading/trailing non-letters (like "1." or "-")
        name = name.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
        
        if (name.length > 2) {
          results.push({ regNumber, name });
        }
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

      let added = 0;
      let updated = 0;

      for (const s of dataToSave) {
        // Sanitize Reg Number (remove spaces)
        s.regNumber = s.regNumber.replace(/\s/g, ''); // Corrected: escaped backslash for regex
        
        const existing = await db.students.where('regNumber').equals(s.regNumber).first();
        if (!existing) {
          await db.students.add(s);
          added++;
        } else {
          // Optional: Only update if name is different or empty
          await db.students.update(existing.id!, { name: s.name });
          updated++;
        }
      }
      
      setShowImportModal(false);
      setPasteData('');
      setParsedStudents([]);
      setManualRows([{name: '', regNumber: ''}]);
      alert(`Import Complete!\nAdded: ${added}\nUpdated: ${updated}`);
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
                      disabled={showMapper}
                    >
                      <Plus size={16} className="me-2" /> Manual
                    </button>
                    <button 
                      className={`nav-link flex-fill ${activeTab === 'paste' ? 'active shadow-sm fw-bold' : 'text-muted'}`}
                      onClick={() => setActiveTab('paste')}
                      disabled={showMapper}
                    >
                      <ClipboardPaste size={16} className="me-2" /> Smart Paste
                    </button>
                    <button 
                      className={`nav-link flex-fill ${activeTab === 'file' ? 'active shadow-sm fw-bold' : 'text-muted'}`}
                      onClick={() => setActiveTab('file')}
                      disabled={showMapper}
                    >
                      <Upload size={16} className="me-2" /> Excel / CSV
                    </button>
                  </div>
                  <button type="button" className="btn-close ms-2" onClick={() => setShowImportModal(false)}></button>
                </div>

                <div className="modal-body p-4 bg-light">
                  {/* Tab Content: Manual (Redesigned) */}
                  {activeTab === 'manual' && !showMapper && (
                    <div className="d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-center mb-2 px-1">
                        <h6 className="fw-bold text-muted text-uppercase small mb-0">Adding {manualRows.length} Students</h6>
                        <button className="btn btn-link text-danger p-0 small text-decoration-none" onClick={() => setManualRows([{name: '', regNumber: ''}])}>
                          Reset All
                        </button>
                      </div>

                      {manualRows.map((row, idx) => (
                        <div key={idx} className="card border-0 shadow-sm rounded-4 overflow-hidden animate-in">
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <span className="badge bg-light text-secondary border fw-bold rounded-pill px-3">
                                Student #{idx + 1}
                              </span>
                              {manualRows.length > 1 && (
                                <button 
                                  className="btn btn-light text-danger rounded-circle p-2"
                                  style={{width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                                  onClick={() => removeManualRow(idx)}
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                            
                            <div className="row g-3">
                              <div className="col-md-7">
                                <label className="form-label x-small fw-bold text-uppercase text-muted ps-1 mb-1">Full Name</label>
                                <div className="input-group modern-input-unified">
                                  <input 
                                    type="text" 
                                    className="form-control" 
                                    placeholder="e.g. Chukwudi Nweke"
                                    value={row.name}
                                    onChange={e => updateManualRow(idx, 'name', e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="col-md-5">
                                <label className="form-label x-small fw-bold text-uppercase text-muted ps-1 mb-1">Reg Number</label>
                                <div className="input-group modern-input-unified">
                                  <input 
                                    type="text" 
                                    className="form-control font-monospace"
                                    placeholder="2021..."
                                    value={row.regNumber}
                                    onChange={e => updateManualRow(idx, 'regNumber', e.target.value)}
                                  />
                                  <button 
                                    className="btn btn-light border-start"
                                    onClick={() => handleScanClick(idx)}
                                    title="Scan ID Card"
                                  >
                                    <ScanLine size={18} className="text-dark" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <button 
                        className="btn btn-outline-primary w-100 py-3 rounded-4 border-dashed fw-bold mt-2"
                        onClick={addManualRow}
                        style={{ borderStyle: 'dashed', borderWidth: '2px' }}
                      >
                        <Plus size={20} className="me-2" /> Add Another Student
                      </button>
                    </div>
                  )}

                  {/* Tab Content: Paste & Preview */}
                  {activeTab === 'paste' && !showMapper && (
                    <div className="d-flex flex-column gap-4 h-100">
                      <div className="card border-0 shadow-sm rounded-4">
                        <div className="card-body p-4">
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <label className="fw-bold text-muted text-uppercase small mb-0">Input Editor</label>
                            <button className="btn btn-link text-muted p-0 small text-decoration-none" onClick={() => setPasteData('')}>Clear Editor</button>
                          </div>
                          <textarea 
                            className="form-control border-0 bg-light p-3 rounded-3 font-monospace"
                            style={{ minHeight: '300px', fontSize: '14px', lineHeight: '1.6' }}
                            placeholder="Paste your raw student list here (WhatsApp, PDF, Word, etc.)&#10;&#10;Example:&#10;1. John Doe - 2021123456&#10;2. Jane Smith [2021987654]&#10;3. 2022101010  Musa Ali"
                            value={pasteData}
                            onChange={e => setPasteData(e.target.value)}
                          />
                          <button 
                            className="btn btn-primary w-100 py-3 mt-4 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2"
                            onClick={handleParse} 
                            disabled={!pasteData.trim()}
                          >
                            <ClipboardPaste size={20} /> Run Smart Parser
                          </button>
                        </div>
                      </div>

                      {parsedStudents.length > 0 && (
                        <div className="animate-in">
                          <PreviewTable data={parsedStudents} setData={setParsedStudents} existingStudents={students || []} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab Content: File Upload */}
                  {activeTab === 'file' && !showMapper && (
                    <div className="row h-100">
                      <div className="col-lg-12">
                        <div className="card border-0 shadow-sm rounded-4 h-100">
                          <div className="card-body text-center d-flex flex-column justify-content-center align-items-center p-5">
                            <div className="bg-success-subtle p-4 rounded-circle mb-3 text-success">
                              <FileText size={48} />
                            </div>
                            <h4 className="fw-bold">Upload Class List</h4>
                            <p className="text-muted mb-4" style={{ maxWidth: '400px' }}>
                              Supports <strong>Excel (.xlsx, .xls)</strong> and <strong>CSV</strong> files. We'll help you map the columns instantly.
                            </p>
                            <div className="position-relative">
                              <input 
                                type="file" 
                                accept=".csv, .xlsx, .xls"
                                className="form-control form-control-lg opacity-0 position-absolute top-0 start-0 w-100 h-100"
                                style={{ cursor: 'pointer', zIndex: 10 }}
                                onChange={handleFileUpload}
                              />
                              <button className="btn btn-primary btn-lg px-5 rounded-pill shadow-sm">
                                Choose File
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* File Mapper View */}
                  {showMapper && uploadedFile && (
                    <FileMapper 
                      file={uploadedFile} 
                      onComplete={handleMapperComplete} 
                      onCancel={() => { setShowMapper(false); setUploadedFile(null); }} 
                    />
                  )}
                </div>

                {!showMapper && (
                  <div className="modal-footer border-top-0">
                    <button type="button" className="btn btn-link text-muted text-decoration-none" onClick={() => setShowImportModal(false)}>Cancel</button>
                    <button type="button" className="btn btn-success px-5 rounded-pill shadow-sm fw-bold" onClick={handleSave}>
                      Save to Database
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Barcode Scanner Overlay */}
      {showScanner && (
        <BarcodeScanner 
          onScanSuccess={handleScanSuccess} 
          onClose={() => setShowScanner(false)} 
        />
      )}
    </div>
  );
}

// Helper Component for Preview Table
function PreviewTable({ data, setData, existingStudents }: { data: Student[], setData: (d: Student[]) => void, existingStudents: Student[] }) {
  return (
    <div className="card border-0 shadow-sm rounded-4 h-100">
      <div className="card-header bg-white border-bottom-0 py-3 d-flex justify-content-between align-items-center">
        <h6 className="fw-bold mb-0">Preview Data ({data.length})</h6>
        <button className="btn btn-link text-danger p-0 small text-decoration-none" onClick={() => setData([])}>Clear All</button>
      </div>
      <div className="table-responsive flex-grow-1" style={{ maxHeight: '400px' }}>
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light small text-muted sticky-top">
            <tr>
              <th>Name</th>
              <th>Reg Number</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s, idx) => {
              // Check for duplicate in DB
              const isDuplicate = existingStudents.some(ex => ex.regNumber === s.regNumber.replace(/\s/g, '')); // Corrected: escaped backslash for regex
              
              return (
                <tr key={idx} className={isDuplicate ? 'table-warning' : ''}>
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
                  <td>
                    <input 
                       type="text" className="form-control form-control-sm border-0 bg-transparent font-monospace"
                       value={s.regNumber}
                       onChange={e => {
                         const newData = [...data];
                         newData[idx].regNumber = e.target.value;
                         setData(newData);
                       }}
                    />
                  </td>
                  <td>
                    {isDuplicate ? (
                      <span className="badge bg-warning text-dark d-flex align-items-center gap-1">
                        <AlertTriangle size={10} /> Update
                      </span>
                    ) : (
                      <span className="badge bg-success-subtle text-success border border-success-subtle">New</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-5 text-muted small">
                  No data parsed yet. Paste text or upload a file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
