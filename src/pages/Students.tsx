import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Trash2, Search, FileText, Upload, X, ScanLine, ArrowLeft, CheckCircle2, ChevronRight, GraduationCap, Calendar, History } from 'lucide-react';
import { db, type Student } from '../db/db';
import FileMapper from '../components/FileMapper';
import BarcodeScanner from '../components/BarcodeScanner';
import { motion, AnimatePresence } from 'framer-motion';

export default function Students() {
  const students = useLiveQuery(() => db.students.orderBy('name').toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
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

  // Pagination
  const itemsPerPage = 7;
  const [currentPage, setCurrentPage] = useState(1);

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
    setImportMode('paste'); 
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
        let name = line.replace(regNumber, '').replace(/[\t]/g, '').trim();
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

      if (dataToSave.length === 0) return;

      for (const s of dataToSave) {
        s.regNumber = s.regNumber.replace(/\s/g, '');
        const existing = await db.students.where('regNumber').equals(s.regNumber).first();
        if (!existing) {
          await db.students.add(s);
        } else {
          await db.students.update(existing.id!, { name: s.name });
        }
      }
      setShowImportModal(false);
      resetImportState();
    } catch (error) {
      console.error(error);
    }
  };

  const filteredStudents = students?.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.regNumber.includes(searchTerm)
  );

  if (searchTerm && currentPage !== 1) setCurrentPage(1);
  const totalPages = Math.ceil((filteredStudents?.length || 0) / itemsPerPage);
  const displayedStudents = filteredStudents?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  };

  return (
    <div className="container-fluid animate-in px-0">
      <div className="sticky-top bg-white bg-opacity-95 backdrop-blur border-bottom pb-3 pt-3 px-3 mb-3 z-index-10 shadow-sm">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h1 className="fw-black letter-spacing-n1 mb-0 h3 text-primary">STUDENTS</h1>
            <p className="text-muted x-small fw-bold text-uppercase tracking-wider mb-0 text-gold">Total: {students?.length || 0} Records</p>
          </div>
          <button className="btn btn-primary rounded-pill shadow-lg d-flex align-items-center gap-2 fw-bold px-4" onClick={() => { setShowImportModal(true); resetImportState(); }}><Plus size={18} /> Add New</button>
        </div>
        <div className="input-group modern-input-unified bg-light shadow-inner">
          <span className="input-group-text border-0 bg-transparent ps-3"><Search size={18} className="text-muted" /></span>
          <input type="text" className="form-control border-0 bg-transparent py-2 fw-medium" placeholder="Search database..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="px-3 pb-5">
        <div className="d-flex flex-column gap-3">
          <AnimatePresence mode="popLayout">
            {displayedStudents?.map(s => (
              <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="student-card card border-0 shadow-sm rounded-4 overflow-hidden" onClick={() => setSelectedStudent(s)} style={{ cursor: 'pointer' }}>
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className="avatar-circle flex-shrink-0 text-white fw-bold shadow-sm" style={{ backgroundColor: stringToColor(s.name) }}>{getInitials(s.name)}</div>
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-1 text-truncate">{s.name}</h6>
                    <div className="badge bg-primary-subtle text-primary border border-primary-subtle fw-normal font-monospace x-small">{s.regNumber}</div>
                  </div>
                  <ChevronRight size={18} className="text-muted opacity-50" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {filteredStudents && filteredStudents.length > itemsPerPage && (
          <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top border-light">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}>Prev</button>
            <span className="small text-muted fw-bold">Page {currentPage} of {totalPages}</span>
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}>Next</button>
          </div>
        )}
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', zIndex: 2000 }} onClick={() => setSelectedStudent(null)} />
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="modal fade show d-block" style={{ zIndex: 2001 }}>
              <div className="modal-dialog modal-dialog-centered px-3">
                <div className="modal-content border-0 shadow-2xl rounded-5 overflow-hidden">
                  <div className="modal-header border-0 bg-white pb-0 pt-4 px-4"><button type="button" className="btn-close ms-auto" onClick={() => setSelectedStudent(null)}></button></div>
                  <div className="modal-body text-center px-4 pb-4">
                    <div className="avatar-circle-lg mx-auto mb-3 shadow-lg text-white fw-black" style={{ backgroundColor: stringToColor(selectedStudent.name) }}>{getInitials(selectedStudent.name)}</div>
                    <h4 className="fw-black mb-1 text-primary text-uppercase letter-spacing-n1">{selectedStudent.name}</h4>
                    <p className="text-muted fw-bold font-monospace mb-4">{selectedStudent.regNumber}</p>
                    <div className="row g-2 mb-4">
                      <div className="col-4"><div className="bg-light p-3 rounded-4"><GraduationCap size={24} className="text-primary mb-1" /><div className="xx-small text-muted fw-bold text-uppercase">Status</div><div className="small fw-black text-dark">ACTIVE</div></div></div>
                      <div className="col-4"><div className="bg-light p-3 rounded-4"><Calendar size={24} className="text-primary mb-1" /><div className="xx-small text-muted fw-bold text-uppercase">Level</div><div className="small fw-black text-dark">N/A</div></div></div>
                      <div className="col-4"><div className="bg-light p-3 rounded-4"><History size={24} className="text-primary mb-1" /><div className="xx-small text-muted fw-bold text-uppercase">Sessions</div><div className="small fw-black text-dark">0</div></div></div>
                    </div>
                    <button className="btn btn-outline-danger w-100 py-3 rounded-4 fw-bold d-flex align-items-center justify-content-center gap-2" onClick={() => { if(confirm('Permanently delete student?')) { db.students.delete(selectedStudent.id!); setSelectedStudent(null); } }}><Trash2 size={18} /> Delete Student Record</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 1050 }}>
          <div className="modal-dialog modal-fullscreen-sm-down modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-2xl rounded-5 overflow-hidden">
              <div className="modal-header bg-primary text-white border-bottom-0 p-4">
                <div className="d-flex align-items-center gap-3">
                  {importMode !== 'select' && <button className="btn btn-white-glass rounded-circle p-2" onClick={resetImportState}><ArrowLeft size={20} /></button>}
                  <h4 className="fw-black mb-0 letter-spacing-n1 text-uppercase">IMPORT CENTER</h4>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowImportModal(false)}></button>
              </div>
              <div className="modal-body p-0 bg-light">
                {showMapper && uploadedFile ? (
                  <div className="p-4"><FileMapper file={uploadedFile} onComplete={handleMapperComplete} onCancel={() => { setShowMapper(false); setUploadedFile(null); }} /></div>
                ) : importMode === 'select' ? (
                  <div className="p-4 p-md-5 d-flex flex-column gap-3">
                    <button className="btn btn-white p-4 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4" onClick={() => setImportMode('manual')}><div className="bg-primary-subtle text-primary p-3 rounded-3"><Plus size={28} /></div><div><h5 className="fw-bold mb-1">Manual Entry</h5><p className="text-muted small mb-0">Type details or scan ID cards.</p></div></button>
                    <button className="btn btn-white p-4 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4" onClick={() => setImportMode('paste')}><div className="bg-warning-subtle text-warning-emphasis p-3 rounded-3"><ClipboardPaste size={28} /></div><div><h5 className="fw-bold mb-1">Smart Paste</h5><p className="text-muted small mb-0">Import from WhatsApp/Text lists.</p></div></button>
                    <button className="btn btn-white p-4 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4" onClick={() => setImportMode('file')}><div className="bg-success-subtle text-success p-3 rounded-3"><FileText size={28} /></div><div><h5 className="fw-bold mb-1">Excel / CSV</h5><p className="text-muted small mb-0">Upload and map spreadsheets.</p></div></button>
                  </div>
                ) : importMode === 'manual' ? (
                  <div className="p-4">
                    {manualRows.map((row, idx) => (
                      <div key={idx} className="card border-0 shadow-sm rounded-4 mb-3"><div className="card-body p-3">
                        <div className="d-flex justify-content-between mb-3"><span className="badge bg-primary-subtle text-primary rounded-pill px-3">Entry #{idx+1}</span>{manualRows.length > 1 && <button className="btn btn-light text-danger rounded-circle p-1" onClick={() => removeManualRow(idx)}><X size={16} /></button>}</div>
                        <div className="row g-3">
                          <div className="col-12"><label className="xx-small fw-bold text-muted">FULL NAME</label><input type="text" className="form-control modern-input-unified" value={row.name} onChange={e => updateManualRow(idx, 'name', e.target.value)} /></div>
                          <div className="col-12"><label className="xx-small fw-bold text-muted">REG NUMBER</label><div className="input-group modern-input-unified"><input type="text" className="form-control" value={row.regNumber} onChange={e => updateManualRow(idx, 'regNumber', e.target.value)} /><button className="btn btn-light border-start" onClick={() => handleScanClick(idx)}><ScanLine size={18} /></button></div></div>
                        </div>
                      </div></div>
                    ))}
                    <button className="btn btn-outline-primary w-100 py-3 rounded-4 border-dashed fw-bold" onClick={addManualRow}>+ Add Row</button>
                  </div>
                ) : importMode === 'paste' ? (
                  <div className="p-4">
                    {parsedStudents.length === 0 ? (
                      <div className="d-flex flex-column gap-3"><textarea className="form-control border-0 bg-white p-3 rounded-4 font-monospace shadow-sm" style={{ minHeight: '300px' }} placeholder="Paste names and numbers here..." value={pasteData} onChange={e => setPasteData(e.target.value)} /><button className="btn btn-primary w-100 py-3 rounded-4 shadow fw-bold" onClick={handleParse}>Process Text</button></div>
                    ) : (
                      <div className="d-flex flex-column gap-3">
                        <div className="d-flex justify-content-between align-items-center"><h6 className="fw-bold mb-0 text-success">{parsedStudents.length} Students Found</h6><button className="btn btn-sm btn-outline-danger" onClick={() => { setParsedStudents([]); setPasteData(''); }}>Clear</button></div>
                        <PreviewTable data={parsedStudents} setData={setParsedStudents} existingStudents={students || []} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-5 text-center">
                    <div className="bg-primary-subtle text-primary p-4 rounded-circle d-inline-block mb-4"><Upload size={48} /></div>
                    <h3>Upload Spreadsheet</h3>
                    <p className="text-muted mb-4">Select an Excel (.xlsx) or CSV file.</p>
                    <input type="file" accept=".csv, .xlsx, .xls" className="form-control opacity-0 position-absolute" id="file-upload" onChange={handleFileUpload} />
                    <label htmlFor="file-upload" className="btn btn-primary btn-lg px-5 rounded-pill shadow fw-bold">Select File</label>
                  </div>
                )}
              </div>
              {importMode !== 'select' && !showMapper && (importMode === 'manual' || parsedStudents.length > 0) && (
                <div className="modal-footer border-0 p-4 bg-white"><button className="btn btn-success w-100 py-3 rounded-pill shadow fw-bold d-flex align-items-center justify-content-center gap-2" onClick={handleSave}><CheckCircle2 size={20} /> Save to Database</button></div>
              )}
            </div>
          </div>
        </div>
      )}

      {showScanner && <BarcodeScanner onScanSuccess={handleScanSuccess} onClose={() => setShowScanner(false)} />}

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .xx-small { font-size: 10px; }
        .text-gold { color: #cfb53b; }
        .avatar-circle { width: 48px; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
        .avatar-circle-lg { width: 84px; height: 84px; border-radius: 28px; display: flex; align-items: center; justify-content: center; font-size: 32px; }
        .student-card { transition: all 0.2s ease; background: #fff; border-left: 4px solid #cfb53b !important; }
        .student-card:active { transform: scale(0.98); }
        .modern-input-unified { background: #f8f9fa; border-radius: 12px; border: 1.5px solid transparent; }
        .modern-input-unified .form-control { border: none; background: transparent; padding: 0.8rem 1rem; font-weight: 600; }
        .btn-white-glass { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); backdrop-filter: blur(4px); }
        .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
      `}</style>
    </div>
  );
}

function PreviewTable({ data, setData, existingStudents }: { data: Student[], setData: (d: Student[]) => void, existingStudents: Student[] }) {
  return (
    <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light small text-muted text-uppercase"><tr><th className="ps-4">Name</th><th>Reg No</th><th className="pe-4 text-end">Status</th></tr></thead>
          <tbody>
            {data.map((s, idx) => {
              const isDup = existingStudents.some(ex => ex.regNumber === s.regNumber.replace(/\s/g, ''));
              return (<tr key={idx} className={isDup ? 'table-warning' : ''}>
                <td className="ps-4"><input type="text" className="form-control form-control-sm border-0 bg-transparent fw-bold" value={s.name} onChange={e => { const n = [...data]; n[idx].name = e.target.value; setData(n); }} /></td>
                <td><input type="text" className="form-control form-control-sm border-0 bg-transparent font-monospace" value={s.regNumber} onChange={e => { const n = [...data]; n[idx].regNumber = e.target.value; setData(n); }} /></td>
                <td className="pe-4 text-end">{isDup ? <span className="badge bg-warning text-dark">Update</span> : <span className="badge bg-success-subtle text-success">New</span>}</td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
