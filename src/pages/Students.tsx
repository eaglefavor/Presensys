import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Trash2, Search, FileText, Upload, X, AlertTriangle, ScanLine, ArrowLeft, CheckCircle2, User } from 'lucide-react';
import { db, type Student } from '../db/db';
import FileMapper from '../components/FileMapper';
import BarcodeScanner from '../components/BarcodeScanner';

export default function Students() {
  const students = useLiveQuery(() => db.students.orderBy('name').toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Modes: 'select' | 'manual' | 'paste' | 'file'
  const [importMode, setImportMode] = useState<'select' | 'manual' | 'paste' | 'file'>('select');
  
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

  // --- Reset Function ---
  const resetImportState = () => {
    setImportMode('select');
    setPasteData('');
    setParsedStudents([]);
    setManualRows([{name: '', regNumber: ''}]);
    setUploadedFile(null);
    setShowMapper(false);
  };

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
    setImportMode('paste'); // Reuse preview view
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
    const results: Student[] = [];
    const lines = pasteData.split('\n');
    const regNoRegex = /(\d{8,})/;

    lines.forEach(line => {
      if (!line.trim()) return;
      const match = line.match(regNoRegex);
      if (match) {
        const regNumber = match[0];
        let name = line.replace(regNumber, '').replace(/[,	]/g, '').trim();
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
      
      if (importMode === 'manual') {
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
        s.regNumber = s.regNumber.replace(/\s/g, '');
        const existing = await db.students.where('regNumber').equals(s.regNumber).first();
        if (!existing) {
          await db.students.add(s);
          added++;
        } else {
          await db.students.update(existing.id!, { name: s.name });
          updated++;
        }
      }
      
      setShowImportModal(false);
      resetImportState();
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

  // Pagination Logic
  const itemsPerPage = 7;
  const [currentPage, setCurrentPage] = useState(1);
  
  // Reset page when search changes
  if (searchTerm && currentPage !== 1) setCurrentPage(1);

  const totalPages = Math.ceil((filteredStudents?.length || 0) / itemsPerPage);
  const displayedStudents = filteredStudents?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Helper to get initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Helper to generate consistent color from name
  const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  };

  return (
    <div className="container-fluid animate-in px-0">
      {/* Sticky Header */}
      <div className="sticky-top bg-white bg-opacity-75 backdrop-blur border-bottom pb-3 pt-3 px-3 mb-3 z-index-10">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h1 className="fw-black letter-spacing-n1 mb-0 h3">STUDENTS</h1>
            <p className="text-muted x-small fw-bold text-uppercase tracking-wider mb-0">
              Total: {students?.length || 0} Records
            </p>
          </div>
          <button 
            className="btn btn-primary rounded-pill shadow-sm d-flex align-items-center gap-2 fw-bold px-3" 
            onClick={() => { setShowImportModal(true); resetImportState(); }}
          >
            <Plus size={18} /> <span className="d-none d-sm-inline">Add New</span>
          </button>
        </div>

        <div className="input-group modern-input-unified bg-white shadow-sm">
          <span className="input-group-text border-0 bg-transparent ps-3"><Search size={18} className="text-muted" /></span>
          <input 
            type="text" 
            className="form-control border-0 bg-transparent py-2"
            placeholder="Search by name or Reg No..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="btn btn-link text-muted pe-3" onClick={() => setSearchTerm('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Student List */}
      <div className="px-3 pb-5">
        <div className="row g-3">
          {displayedStudents?.map(s => (
            <div key={s.id} className="col-12 col-md-6 col-lg-4">
              <div className="student-card card border-0 shadow-sm rounded-4 h-100 position-relative overflow-hidden">
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div 
                    className="avatar-circle flex-shrink-0 text-white fw-bold shadow-sm"
                    style={{ backgroundColor: stringToColor(s.name) }}
                  >
                    {getInitials(s.name)}
                  </div>
                  
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-1 text-truncate">{s.name}</h6>
                    <div className="badge bg-light text-dark border fw-normal font-monospace x-small">
                      {s.regNumber}
                    </div>
                  </div>

                  <button 
                    className="btn btn-light text-danger rounded-circle p-2 flex-shrink-0 hover-bg-danger-subtle"
                    onClick={() => {
                        if(confirm('Delete ' + s.name + '?')) db.students.delete(s.id!);
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Controls */}
        {filteredStudents && filteredStudents.length > 0 && (
          <div className="d-flex justify-content-between align-items-center mt-4 pt-2 border-top">
            <button 
              className="btn btn-light btn-sm fw-bold rounded-pill px-3"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            >
              Previous
            </button>
            <span className="small text-muted fw-bold">
              Page {currentPage} of {totalPages}
            </span>
            <button 
              className="btn btn-light btn-sm fw-bold rounded-pill px-3"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            >
              Next
            </button>
          </div>
        )}

        {filteredStudents?.length === 0 && (
          <div className="text-center py-5 mt-4">
            <div className="bg-light d-inline-block p-4 rounded-circle mb-3">
              <User size={48} className="text-muted opacity-25" />
            </div>
            <h5 className="fw-bold text-muted">No Students Found</h5>
            <p className="text-muted small">
              {searchTerm ? 'Try adjusting your search.' : 'Get started by adding students to the database.'}
            </p>
            {!searchTerm && (
              <button 
                className="btn btn-outline-primary rounded-pill px-4 fw-bold mt-2"
                onClick={() => { setShowImportModal(true); resetImportState(); }}
              >
                Start Import
              </button>
            )}
          </div>
        )}
      </div>

      {/* Premium Import Modal */}
      {showImportModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)' }}>
            <div className="modal-dialog modal-fullscreen-sm-down modal-xl modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content border-0 shadow-2xl rounded-5 overflow-hidden">
                
                {/* Header */}
                <div className="modal-header bg-primary text-white border-bottom-0 p-4 position-relative overflow-hidden">
                  <div className="position-absolute top-0 end-0 p-3 opacity-10">
                    <Upload size={120} />
                  </div>
                  <div className="d-flex align-items-center gap-3 position-relative" style={{ zIndex: 10 }}>
                    {importMode !== 'select' && (
                      <button className="btn btn-white-glass rounded-circle p-2" onClick={resetImportState}>
                        <ArrowLeft size={20} />
                      </button>
                    )}
                    <div>
                      <h4 className="fw-black mb-0 letter-spacing-n1">IMPORT CENTER</h4>
                      <p className="mb-0 opacity-75 x-small fw-bold text-uppercase tracking-wider">
                        {importMode === 'select' ? 'Choose Import Method' : 
                         importMode === 'manual' ? 'Manual Entry' :
                         importMode === 'paste' ? 'Smart Parser' : 'File Upload'}
                      </p>
                    </div>
                  </div>
                  <button type="button" className="btn-close btn-close-white position-absolute top-0 end-0 m-4" onClick={() => setShowImportModal(false)}></button>
                </div>

                <div className="modal-body p-0 bg-light">
                  
                  {/* MODE: SELECT */}
                  {importMode === 'select' && (
                    <div className="p-4 p-md-5">
                      <div className="row g-4">
                        <div className="col-md-4">
                          <button 
                            className="btn btn-white h-100 w-100 p-4 rounded-4 shadow-sm border-0 text-start hover-lift card-select"
                            onClick={() => setImportMode('manual')}
                          >
                            <div className="icon-box bg-primary-subtle text-primary mb-3">
                              <Plus size={28} />
                            </div>
                            <h5 className="fw-bold text-dark mb-2">Manual Entry</h5>
                            <p className="text-muted small mb-0">Type details manually or scan ID cards individually. Best for small additions.</p>
                          </button>
                        </div>
                        <div className="col-md-4">
                          <button 
                            className="btn btn-white h-100 w-100 p-4 rounded-4 shadow-sm border-0 text-start hover-lift card-select"
                            onClick={() => setImportMode('paste')}
                          >
                            <div className="icon-box bg-warning-subtle text-warning-emphasis mb-3">
                              <ClipboardPaste size={28} />
                            </div>
                            <h5 className="fw-bold text-dark mb-2">Smart Paste</h5>
                            <p className="text-muted small mb-0">Copy text from WhatsApp, Word, or PDF. We'll automatically find names and numbers.</p>
                          </button>
                        </div>
                        <div className="col-md-4">
                          <button 
                            className="btn btn-white h-100 w-100 p-4 rounded-4 shadow-sm border-0 text-start hover-lift card-select"
                            onClick={() => setImportMode('file')}
                          >
                            <div className="icon-box bg-success-subtle text-success mb-3">
                              <FileText size={28} />
                            </div>
                            <h5 className="fw-bold text-dark mb-2">Excel / CSV</h5>
                            <p className="text-muted small mb-0">Upload a spreadsheet. We'll help you map the columns to our database format.</p>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODE: MANUAL */}
                  {importMode === 'manual' && (
                    <div className="p-4">
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
                    </div>
                  )}

                  {/* MODE: PASTE */}
                  {importMode === 'paste' && !showMapper && (
                    <div className="p-4 h-100 d-flex flex-column">
                      {parsedStudents.length === 0 ? (
                        <div className="card border-0 shadow-sm rounded-4 flex-grow-1">
                          <div className="card-body p-4 d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <label className="fw-bold text-muted text-uppercase small mb-0">Input Editor</label>
                              <button className="btn btn-link text-muted p-0 small text-decoration-none" onClick={() => setPasteData('')}>Clear Editor</button>
                            </div>
                            <textarea 
                              className="form-control border-0 bg-light p-3 rounded-3 font-monospace flex-grow-1 mb-3"
                              style={{ minHeight: '300px', fontSize: '14px', lineHeight: '1.6', resize: 'none' }}
                              placeholder="Paste names and numbers here..."
                              value={pasteData}
                              onChange={e => setPasteData(e.target.value)}
                            />
                            <button 
                              className="btn btn-primary w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2"
                              onClick={handleParse} 
                              disabled={!pasteData.trim()}
                            >
                              <ClipboardPaste size={20} /> Run Smart Parser
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="h-100 d-flex flex-column">
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="fw-bold mb-0 text-success d-flex align-items-center gap-2">
                              <CheckCircle2 size={20} /> {parsedStudents.length} Students Found
                            </h6>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => { setParsedStudents([]); setPasteData(''); }}>
                              Clear & Start Over
                            </button>
                          </div>
                          <div className="flex-grow-1 overflow-auto">
                            <PreviewTable data={parsedStudents} setData={setParsedStudents} existingStudents={students || []} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE: FILE */}
                  {importMode === 'file' && !showMapper && (
                    <div className="p-5 h-100 d-flex flex-column justify-content-center">
                      <div className="card border-0 shadow-sm rounded-4 p-5 text-center">
                        <div className="bg-primary-subtle p-4 rounded-circle mb-4 text-primary mx-auto" style={{width: 'fit-content'}}>
                          <FileText size={48} />
                        </div>
                        <h3 className="fw-bold mb-2">Upload Spreadsheet</h3>
                        <p className="text-muted mb-4 mx-auto" style={{maxWidth: '400px'}}>
                          Select an Excel (.xlsx) or CSV file. Our intelligent mapper will help you sort the data.
                        </p>
                        <div className="position-relative mx-auto" style={{maxWidth: '300px'}}>
                          <input 
                            type="file" 
                            accept=".csv, .xlsx, .xls"
                            className="form-control form-control-lg opacity-0 position-absolute top-0 start-0 w-100 h-100"
                            style={{ cursor: 'pointer', zIndex: 10 }}
                            onChange={handleFileUpload}
                          />
                          <button className="btn btn-primary w-100 py-3 rounded-pill shadow fw-bold">
                            Select File
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MAPPER */}
                  {showMapper && uploadedFile && (
                    <div className="p-4 h-100">
                      <FileMapper 
                        file={uploadedFile} 
                        onComplete={handleMapperComplete} 
                        onCancel={() => { setShowMapper(false); setUploadedFile(null); }} 
                      />
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                {importMode !== 'select' && !showMapper && (
                  <div className="modal-footer border-top-0 bg-white p-4">
                    <button type="button" className="btn btn-link text-muted text-decoration-none fw-medium" onClick={resetImportState}>Cancel</button>
                    {(importMode === 'manual' || parsedStudents.length > 0) && (
                      <button type="button" className="btn btn-success px-5 py-3 rounded-pill shadow fw-bold" onClick={handleSave}>
                        Save to Database
                      </button>
                    )}
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

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .tracking-wider { letter-spacing: 1px; }
        .x-small { font-size: 11px; }
        
        .backdrop-blur { backdrop-filter: blur(10px); }
        .z-index-10 { z-index: 10; }

        .btn-white-glass {
          background: rgba(255,255,255,0.2);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
          backdrop-filter: blur(4px);
        }
        .btn-white-glass:hover {
          background: rgba(255,255,255,0.3);
          color: white;
        }

        .icon-box {
          width: 60px;
          height: 60px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hover-lift {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
        }
        .hover-lift:active {
          transform: scale(0.98);
        }
        
        @media (min-width: 992px) {
          .hover-lift:hover {
            transform: translateY(-5px);
            box-shadow: 0 1rem 3rem rgba(0,0,0,0.1) !important;
          }
        }

        .modern-input-unified {
          background: #fff;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #dee2e6;
          transition: all 0.2s ease;
        }
        .modern-input-unified:focus-within {
          border-color: #0d6efd;
          box-shadow: 0 0 0 4px rgba(13,110,253,0.1);
        }
        .modern-input-unified .form-control {
          border: none;
          padding: 0.75rem 1rem;
        }
        .modern-input-unified .form-control:focus { box-shadow: none; }

        .avatar-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        
        .student-card { transition: all 0.2s; }
        .student-card:active { transform: scale(0.98); }
      `}</style>
    </div>
  );
}

// Helper Component for Preview Table
function PreviewTable({ data, setData, existingStudents }: { data: Student[], setData: (d: Student[]) => void, existingStudents: Student[] }) {
  return (
    <div className="card border-0 shadow-sm rounded-4 h-100">
      <div className="card-header bg-white border-bottom-0 py-3 d-flex justify-content-between align-items-center">
        <h6 className="fw-bold mb-0 text-muted text-uppercase x-small">Data Review</h6>
      </div>
      <div className="table-responsive flex-grow-1">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light small text-muted sticky-top">
            <tr>
              <th className="ps-4">Name</th>
              <th>Reg Number</th>
              <th className="pe-4 text-end">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s, idx) => {
              const isDuplicate = existingStudents.some(ex => ex.regNumber === s.regNumber.replace(/\s/g, ''));
              return (
                <tr key={idx} className={isDuplicate ? 'table-warning' : ''}>
                  <td className="ps-4">
                    <input 
                      type="text" className="form-control form-control-sm border-0 bg-transparent fw-bold"
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
                  <td className="pe-4 text-end">
                    {isDuplicate ? (
                      <span className="badge bg-warning text-dark d-inline-flex align-items-center gap-1">
                        <AlertTriangle size={10} /> Update
                      </span>
                    ) : (
                      <span className="badge bg-success-subtle text-success border border-success-subtle">New</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
