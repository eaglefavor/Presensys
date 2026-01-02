import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Search, FileText, Upload, X, ScanLine, ArrowLeft, CheckCircle2, ChevronRight, GraduationCap, Calendar, History } from 'lucide-react';
import { db, type Student } from '../db/db';
import FileMapper from '../components/FileMapper';
import BarcodeScanner from '../components/BarcodeScanner';
import { motion, AnimatePresence } from 'framer-motion';

export default function Students() {
  const students = useLiveQuery(() => db.students.orderBy('name').toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  const [importMode, setImportMode] = useState<'select' | 'manual' | 'paste' | 'file'>('select');
  const [pasteData, setPasteData] = useState('');
  const [parsedStudents, setParsedStudents] = useState<Student[]>([]);
  const [manualRows, setManualRows] = useState<{name: string, regNumber: string}[]>([{name: '', regNumber: ''}]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showMapper, setShowMapper] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [activeScanRowIndex, setActiveScanRowIndex] = useState<number | null>(null);

  const itemsPerPage = 7;
  const [currentPage, setCurrentPage] = useState(1);

  const resetImportState = () => {
    setImportMode('select');
    setPasteData('');
    setParsedStudents([]);
    setManualRows([{name: '', regNumber: ''}]);
    setUploadedFile(null);
    setShowMapper(false);
  };

  const handleScanClick = (index: number) => {
    setActiveScanRowIndex(index);
    setShowScanner(true);
  };

  const handleScanSuccess = (decodedText: string) => {
    if (activeScanRowIndex !== null) updateManualRow(activeScanRowIndex, 'regNumber', decodedText);
    setShowScanner(false);
    setActiveScanRowIndex(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setUploadedFile(file); setShowMapper(true); }
  };

  const handleMapperComplete = (data: { name: string; regNumber: string }[]) => {
    setParsedStudents(data);
    setShowMapper(false);
    setUploadedFile(null);
    setImportMode('paste'); 
  };

  const addManualRow = () => setManualRows([...manualRows, {name: '', regNumber: ''}]);
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

  const handleParse = () => {
    const results: Student[] = [];
    const lines = pasteData.split('\n');
    const regNoRegex = /(\d{8,})/; // Corrected regex escaping
    lines.forEach(line => {
      const match = line.match(regNoRegex);
      if (match) {
        const regNumber = match[0];
        let name = line.replace(regNumber, '').replace(/[\,\t]/g, '').trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, ''); // Corrected regex escaping
        if (name.length > 2) results.push({ regNumber, name });
      }
    });
    setParsedStudents(results);
  };

  const handleSave = async () => {
    try {
      let dataToSave = importMode === 'manual' ? manualRows.filter(r => r.name.trim() && r.regNumber.trim()) : parsedStudents;
      if (dataToSave.length === 0) return;
      for (const s of dataToSave) {
        s.regNumber = s.regNumber.replace(/\s/g, ''); // Corrected regex escaping
        const existing = await db.students.where('regNumber').equals(s.regNumber).first();
        if (!existing) await db.students.add(s);
        else await db.students.update(existing.id!, { name: s.name });
      }
      setShowImportModal(false);
      resetImportState();
    } catch (error) { console.error(error); }
  };

  const filteredStudents = students?.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.regNumber.includes(searchTerm));
  if (searchTerm && currentPage !== 1) setCurrentPage(1);
  const totalPages = Math.ceil((filteredStudents?.length || 0) / itemsPerPage);
  const displayedStudents = filteredStudents?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return '#' + (hash & 0x00FFFFFF).toString(16).toUpperCase().padStart(6, '0');
  };

  return (
    <div className="students-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Simplistic White Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h1 className="h4 fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>STUDENT RECORDS</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Database Management</p>
          </div>
          <button className="btn btn-primary rounded-pill px-4 fw-bold shadow-sm py-2 d-flex align-items-center gap-2" onClick={() => { setShowImportModal(true); resetImportState(); }}>
            <Plus size={18} /> <span className="small">Add New</span>
          </button>
        </div>
        <div className="modern-input-unified p-1 d-flex align-items-center">
          <Search size={18} className="text-muted ms-2" />
          <input type="text" className="form-control border-0 bg-transparent py-2 fw-medium" placeholder="Search database..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="px-4 container-mobile">
        <div className="d-flex flex-column gap-2">
          <AnimatePresence mode="popLayout">
            {displayedStudents?.map(s => (
              <motion.div key={s.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="card border-0 bg-white cursor-pointer shadow-sm" onClick={() => setSelectedStudent(s)}>
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className="avatar-circle flex-shrink-0 text-white fw-bold shadow-sm" style={{ backgroundColor: stringToColor(s.name) }}>{getInitials(s.name)}</div>
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-bold mb-0 text-dark text-truncate">{s.name}</h6>
                    <div className="xx-small fw-bold text-muted font-monospace">{s.regNumber}</div>
                  </div>
                  <ChevronRight size={16} className="text-muted opacity-50" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredStudents && filteredStudents.length > itemsPerPage && (
          <div className="d-flex justify-content-between align-items-center mt-4 pt-2">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 border" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}>Prev</button>
            <span className="xx-small fw-black text-muted uppercase">Page {currentPage} of {totalPages}</span>
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 border" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}>Next</button>
          </div>
        )}
      </div>

      {/* Details Bottom Sheet */}
      <AnimatePresence>
        {selectedStudent && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 2000 }} onClick={() => setSelectedStudent(null)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="modal fade show d-block" style={{ zIndex: 2001, top: 'auto', bottom: 0 }}>
              <div className="modal-dialog modal-dialog-centered m-0" style={{ maxWidth: 'none' }}>
                <div className="modal-content border-0 shadow-2xl rounded-top-5 pb-5">
                  <div className="modal-header border-0 bg-white pb-0 pt-4 px-4"><div className="mx-auto bg-light rounded-pill" style={{ width: '40px', height: '4px' }}></div></div>
                  <div className="modal-body px-4 text-center">
                    <div className="avatar-circle-lg mx-auto mb-3 shadow-lg text-white fw-black" style={{ backgroundColor: stringToColor(selectedStudent.name) }}>{getInitials(selectedStudent.name)}</div>
                    <h4 className="fw-black mb-1" style={{ color: 'var(--primary-blue)' }}>{selectedStudent.name}</h4>
                    <p className="xx-small fw-bold text-muted font-monospace tracking-widest mb-4">{selectedStudent.regNumber}</p>
                    
                    <div className="row g-2 mb-4">
                      <div className="col-4"><div className="bg-light p-3 rounded-3"><GraduationCap size={20} className="text-primary mb-1" /><div className="xx-small fw-bold text-muted">STATUS</div><div className="small fw-black text-dark">ACTIVE</div></div></div>
                      <div className="col-4"><div className="bg-light p-3 rounded-3"><Calendar size={20} className="text-primary mb-1" /><div className="xx-small fw-bold text-muted">JOINED</div><div className="small fw-black text-dark">2024</div></div></div>
                      <div className="col-4"><div className="bg-light p-3 rounded-3"><History size={20} className="text-primary mb-1" /><div className="xx-small fw-bold text-muted">ATTEND</div><div className="small fw-black text-dark">0%</div></div></div>
                    </div>

                    <div className="d-flex flex-column gap-2">
                      <button className="btn btn-light w-100 py-3 rounded-3 fw-bold border" onClick={() => setSelectedStudent(null)}>Close View</button>
                      <button className="btn btn-link text-danger fw-bold xx-small text-decoration-none py-2" onClick={() => { if(confirm('Delete student record?')) { db.students.delete(selectedStudent.id!); setSelectedStudent(null); } }}>Delete Student</button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Import Modal (Clean Style) */}
      {showImportModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1050 }}>
          <motion.div className="modal-dialog modal-fullscreen-sm-down modal-xl modal-dialog-centered px-3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-content border-0 shadow-2xl rounded-4">
              <div className="modal-header border-bottom p-4">
                <div className="d-flex align-items-center gap-3">
                  {importMode !== 'select' && <button className="btn btn-light rounded-circle p-2" onClick={resetImportState}><ArrowLeft size={20} /></button>}
                  <h5 className="fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>IMPORT CENTER</h5>
                </div>
                <button type="button" className="btn-close" onClick={() => setShowImportModal(false)}></button>
              </div>
              <div className="modal-body p-0 bg-light">
                {showMapper && uploadedFile ? (
                  <div className="p-4 bg-white"><FileMapper file={uploadedFile} onComplete={handleMapperComplete} onCancel={() => { setShowMapper(false); setUploadedFile(null); }} /></div>
                ) : importMode === 'select' ? (
                  <div className="p-4 d-flex flex-column gap-2">
                    <button className="btn btn-white p-3 rounded-3 border-0 shadow-sm text-start d-flex align-items-center gap-3" onClick={() => setImportMode('manual')}><div className="bg-primary bg-opacity-10 text-primary p-2 rounded-2"><Plus size={24} /></div><div><div className="fw-bold small">Manual Entry</div><div className="xx-small text-muted">Individual student addition</div></div></button>
                    <button className="btn btn-white p-3 rounded-3 border-0 shadow-sm text-start d-flex align-items-center gap-3" onClick={() => setImportMode('paste')}><div className="bg-warning bg-opacity-10 text-warning p-2 rounded-2"><ClipboardPaste size={24} /></div><div><div className="fw-bold small">Smart Paste</div><div className="xx-small text-muted">Import from text lists</div></div></button>
                    <button className="btn btn-white p-3 rounded-3 border-0 shadow-sm text-start d-flex align-items-center gap-3" onClick={() => setImportMode('file')}><div className="bg-success bg-opacity-10 text-success p-2 rounded-2"><FileText size={24} /></div><div><div className="fw-bold small">Excel / CSV</div><div className="xx-small text-muted">Bulk spreadsheet upload</div></div></button>
                  </div>
                ) : importMode === 'manual' ? (
                  <div className="p-4">
                    {manualRows.map((row, idx) => (
                      <div key={idx} className="card border-0 bg-white mb-2"><div className="card-body p-2 px-3 d-flex flex-column gap-2">
                        <div className="d-flex justify-content-between"><span className="xx-small fw-black text-muted">ENTRY #{idx+1}</span>{manualRows.length > 1 && <button className="btn btn-link text-danger p-0" onClick={() => removeManualRow(idx)}><X size={14} /></button>}</div>
                        <input type="text" className="form-control modern-input-unified p-2 small fw-bold" placeholder="FULL NAME" value={row.name} onChange={e => updateManualRow(idx, 'name', e.target.value)} />
                        <div className="input-group modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent small fw-bold" placeholder="REG NUMBER" value={row.regNumber} onChange={e => updateManualRow(idx, 'regNumber', e.target.value)} /><button className="btn btn-light rounded-2" onClick={() => handleScanClick(idx)}><ScanLine size={16} /></button></div>
                      </div></div>
                    ))}
                    <button className="btn btn-outline-primary w-100 py-2 rounded-3 border-dashed small fw-bold mt-2" onClick={addManualRow}>+ Add Row</button>
                  </div>
                ) : importMode === 'paste' ? (
                  <div className="p-4">
                    {parsedStudents.length === 0 ? (
                      <div className="d-flex flex-column gap-3"><textarea className="form-control border-0 bg-white p-3 rounded-3 shadow-sm font-monospace" style={{ minHeight: '300px', fontSize: '13px' }} placeholder="Paste names and numbers here..." value={pasteData} onChange={e => setPasteData(e.target.value)} /><button className="btn btn-primary w-100 py-3 rounded-3 fw-bold" onClick={handleParse}>PROCESS TEXT</button></div>
                    ) : (
                      <div className="d-flex flex-column gap-2">
                        <div className="d-flex justify-content-between align-items-center px-1"><h6 className="fw-black text-success small mb-0">{parsedStudents.length} STUDENTS READY</h6><button className="btn btn-link text-danger xx-small fw-bold text-decoration-none" onClick={() => { setParsedStudents([]); setPasteData(''); }}>RESET</button></div>
                        <div className="overflow-auto" style={{ maxHeight: '400px' }}><PreviewTable data={parsedStudents} setData={setParsedStudents} existingStudents={students || []} /></div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-5 text-center bg-white"><div className="bg-primary bg-opacity-10 text-primary p-4 rounded-circle d-inline-block mb-3"><Upload size={48} /></div><h5 className="fw-black">UPLOAD SPREADSHEET</h5><p className="xx-small fw-bold text-muted mb-4">EXCEL OR CSV FILES ONLY</p><input type="file" accept=".csv, .xlsx, .xls" className="form-control opacity-0 position-absolute" id="file-up" onChange={handleFileUpload} /><label htmlFor="file-up" className="btn btn-primary px-5 py-3 rounded-pill fw-bold shadow-sm">SELECT FILE</label></div>
                )}
              </div>
              {importMode !== 'select' && !showMapper && (importMode === 'manual' || parsedStudents.length > 0) && (
                <div className="modal-footer border-0 p-4 pt-0"><button className="btn btn-success w-100 py-3 rounded-3 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" onClick={handleSave}><CheckCircle2 size={20} /> FINISH IMPORT</button></div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {showScanner && <BarcodeScanner onScanSuccess={handleScanSuccess} onClose={() => setShowScanner(false)} />}

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
        .rounded-top-5 { border-top-left-radius: 32px !important; border-top-right-radius: 32px !important; }
        .avatar-circle { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .avatar-circle-lg { width: 80px; height: 80px; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 32px; }
        .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
        .shadow-inner { box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
      `}</style>
    </div>
  );
}

function PreviewTable({ data, setData, existingStudents }: { data: Student[], setData: (d: Student[]) => void, existingStudents: Student[] }) {
  return (
    <div className="d-flex flex-column gap-2">
      {data.map((s, idx) => {
        const isDup = existingStudents.some(ex => ex.regNumber === s.regNumber.replace(/\s/g, '')); // Corrected regex escaping
        return (
          <div key={idx} className={`card border-0 p-2 shadow-sm ${isDup ? 'bg-warning-subtle' : 'bg-white'}`}>
            <div className="d-flex align-items-center gap-2">
              <input type="text" className="form-control form-control-sm border-0 bg-transparent fw-bold flex-grow-1" value={s.name} onChange={e => { const n = [...data]; n[idx].name = e.target.value; setData(n); }} />
              <input type="text" className="form-control form-control-sm border-0 bg-transparent font-monospace text-muted xx-small" style={{ width: '100px' }} value={s.regNumber} onChange={e => { const n = [...data]; n[idx].regNumber = e.target.value; setData(n); }} />
              {isDup && <span className="badge bg-warning text-dark xx-small">UPD</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}