import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Search, FileText, Upload, X, ScanLine, ArrowLeft, CheckCircle2, ChevronRight, GraduationCap, Calendar, History, Edit2, Save, Download, Trash2, Info, AlertTriangle } from 'lucide-react';
import { db, type Student } from '../db/db';
import FileMapper from '../components/FileMapper';
import BarcodeScanner from '../components/BarcodeScanner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Students() {
  const { user } = useAuthStore();
  const students = useLiveQuery(() => db.students.orderBy('name').toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', regNumber: '' });
  
  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Import States
  const [importMode, setImportMode] = useState<'select' | 'manual' | 'paste' | 'file'>('select');
  const [pasteData, setPasteData] = useState('');
  const [parsedStudents, setParsedStudents] = useState<Student[]>([]);
  const [manualRows, setManualRows] = useState<{name: string, regNumber: string, error?: string}[]>([{name: '', regNumber: ''}]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showMapper, setShowMapper] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [activeScanRowIndex, setActiveScanRowIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const itemsPerPage = 7;
  const [currentPage, setCurrentPage] = useState(1);

  // --- Bulk Selection Logic ---
  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
    if (newSet.size === 0 && !isSelectionMode) setIsSelectionMode(false);
  };

  const handleLongPress = (id: number) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
      if (window.navigator.vibrate) window.navigator.vibrate(50);
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`Permanently delete ${selectedIds.size} students?`)) {
      await db.students.bulkDelete(Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  // --- Export Logic ---
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Student List', 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = (students || []).map(s => [s.name, s.regNumber]);

    autoTable(doc, {
      startY: 36,
      head: [['Full Name', 'Reg Number']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [13, 110, 253] }
    });

    doc.save('presensys_student_list.pdf');
  };

  // --- Standard Logic (Reset, Scan, Upload, Parse, Save) ---
  const resetImportState = () => {
    setImportMode('select');
    setPasteData('');
    setParsedStudents([]);
    setManualRows([{name: '', regNumber: ''}]);
    setUploadedFile(null);
    setShowMapper(false);
    setIsSaving(false);
    setParseError(null);
  };

  const handleEditClick = () => {
    if (selectedStudent) {
      setEditForm({ name: selectedStudent.name, regNumber: selectedStudent.regNumber });
      setIsEditing(true);
    }
  };

  const handleEditSave = async () => {
    if (!selectedStudent || !editForm.name || !editForm.regNumber) return;
    if (!/^\d{10}$/.test(editForm.regNumber)) {
      alert('Reg Number must be exactly 10 digits.');
      return;
    }
    await db.students.update(selectedStudent.id!, { name: editForm.name, regNumber: editForm.regNumber, userId: user?.id, synced: 0 });
    setIsEditing(false);
    setSelectedStudent(null);
  };

  const handleScanClick = (index: number) => {
    setActiveScanRowIndex(index);
    setShowScanner(true);
  };

  const handleScanSuccess = (decodedText: string) => {
    const regNoMatch = decodedText.match(/(\d{10})/); 
    const finalValue = regNoMatch ? regNoMatch[0] : decodedText;
    if (activeScanRowIndex !== null) updateManualRow(activeScanRowIndex, 'regNumber', finalValue);
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
    if (field === 'regNumber') {
      if (value.length > 0 && !/^\d*$/.test(value)) return;
      if (value.length === 10) newRows[index].error = undefined;
      else if (value.length > 0) newRows[index].error = "Must be 10 digits";
    }
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
    setParseError(null);
    const results: Student[] = [];
    const lines = pasteData.split('\n');
    const regNoRegex = /(\d{10})/; // Strict 10 digit check
    lines.forEach(line => {
      const match = line.match(regNoRegex);
      if (match) {
        const regNumber = match[0];
        let name = line.replace(regNumber, '').replace(/[,	]/g, '').trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
        if (name.length > 2) results.push({ regNumber, name });
      }
    });
    if (results.length === 0 && pasteData.trim().length > 0) {
      setParseError("Could not find any valid 10-digit Registration Numbers.");
    } else {
      setParsedStudents(results);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      let dataToSave = importMode === 'manual' ? manualRows.filter(r => r.name.trim() && r.regNumber.trim()) : parsedStudents;
      const validData: Student[] = [];
      const seenRegs = new Set();
      let hasErrors = false;

      for (const s of dataToSave) {
        s.regNumber = s.regNumber.replace(/\s/g, '');
        if (!/^\d{10}$/.test(s.regNumber)) {
          alert(`Invalid Reg Number: ${s.regNumber}. Must be exactly 10 digits.`);
          hasErrors = true; break;
        }
        if (seenRegs.has(s.regNumber)) {
          alert(`Duplicate in list: ${s.regNumber} appears twice.`);
          hasErrors = true; break;
        }
        seenRegs.add(s.regNumber);
        validData.push(s);
      }

      if (hasErrors || validData.length === 0) {
        setIsSaving(false); return;
      }
      
      await db.transaction('rw', db.students, async () => {
        for (const s of validData) {
          const existing = await db.students.where('regNumber').equals(s.regNumber).first();
          if (!existing) await db.students.add({ ...s, userId: user.id, synced: 0 });
          else await db.students.update(existing.id!, { name: s.name, userId: user.id, synced: 0 });
        }
      });
      setShowImportModal(false);
      resetImportState();
    } catch (error) { 
      console.error(error); 
      alert('Save failed.');
    } finally {
      setIsSaving(false);
    }
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
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h1 className="h4 fw-black mb-0" style={{ color: 'var(--primary-blue)' }}>STUDENT RECORDS</h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Database Management</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light rounded-circle p-2 shadow-sm border" onClick={handleExportPDF} title="Export PDF">
              <Download size={20} className="text-muted" />
            </button>
            <button className="btn btn-primary rounded-pill px-4 fw-bold shadow-sm py-2 d-flex align-items-center gap-2" onClick={() => { setShowImportModal(true); resetImportState(); }}>
              <Plus size={18} /> <span className="small">Add New</span>
            </button>
          </div>
        </div>
        <div className="modern-input-unified p-1 d-flex align-items-center bg-light shadow-inner">
          <Search size={18} className="text-muted ms-2" />
          <input type="text" className="form-control border-0 bg-transparent py-2 fw-medium" placeholder="Search database..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* List */}
      <div className="px-4 container-mobile">
        {/* Bulk Action Header */}
        {isSelectionMode && (
          <div className="mb-3 d-flex justify-content-between align-items-center animate-in">
            <span className="fw-bold text-primary small">{selectedIds.size} Selected</span>
            <button className="btn btn-link text-muted p-0 small text-decoration-none" onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}>Cancel</button>
          </div>
        )}

        <div className="d-flex flex-column gap-2">
          <AnimatePresence mode="popLayout">
            {displayedStudents?.map(s => {
              const isSelected = selectedIds.has(s.id!);
              return (
                <motion.div 
                  key={s.id} 
                  layout 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className={`card border-0 shadow-sm rounded-3 cursor-pointer ${isSelected ? 'bg-primary-subtle ring-2 ring-primary' : 'bg-white'}`}
                  onContextMenu={(e) => { e.preventDefault(); handleLongPress(s.id!); }}
                  onClick={() => {
                    if (isSelectionMode) toggleSelection(s.id!);
                    else setSelectedStudent(s);
                  }}
                >
                  <div className="card-body p-3 d-flex align-items-center gap-3">
                    {isSelectionMode ? (
                      <div className={`rounded-circle p-1 ${isSelected ? 'bg-primary text-white' : 'bg-light text-muted'}`}>
                        {isSelected ? <CheckCircle2 size={24} /> : <div style={{width: 24, height: 24, border: '2px solid #dee2e6', borderRadius: '50%'}}></div>}
                      </div>
                    ) : (
                      <div className="avatar-circle flex-shrink-0 text-white fw-bold shadow-sm" style={{ backgroundColor: stringToColor(s.name) }}>{getInitials(s.name)}</div>
                    )}
                    <div className="flex-grow-1 overflow-hidden">
                      <h6 className="fw-bold mb-0 text-dark text-truncate">{s.name}</h6>
                      <div className="xx-small fw-bold text-muted font-monospace">{s.regNumber}</div>
                    </div>
                    {!isSelectionMode && <ChevronRight size={16} className="text-muted opacity-50" />}
                  </div>
                </motion.div>
              );
            })}
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

      {/* Floating Action Bar (Bulk Mode) */}
      <AnimatePresence>
        {isSelectionMode && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed-bottom p-4 bg-white border-top shadow-lg z-index-20"
            style={{ zIndex: 2000 }}
          >
            <div className="container-mobile d-flex gap-3">
              <button className="btn btn-light flex-grow-1 fw-bold" onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}>Cancel</button>
              <button className="btn btn-danger flex-grow-1 fw-bold d-flex align-items-center justify-content-center gap-2" onClick={handleBulkDelete}>
                <Trash2 size={18} /> Delete ({selectedIds.size})
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details Bottom Sheet (Editable) */}
      <AnimatePresence>
        {selectedStudent && !isSelectionMode && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 2000 }} onClick={() => { setSelectedStudent(null); setIsEditing(false); }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="modal fade show d-block" style={{ zIndex: 2001, top: 'auto', bottom: 0 }}>
              <div className="modal-dialog modal-dialog-centered m-0" style={{ maxWidth: 'none' }}>
                <div className="modal-content border-0 shadow-2xl rounded-top-5 pb-5">
                  <div className="modal-header border-0 bg-white pb-0 pt-4 px-4"><div className="mx-auto bg-light rounded-pill" style={{ width: '40px', height: '4px' }}></div></div>
                  <div className="modal-body px-4 text-center">
                    {!isEditing ? (
                      <>
                        <div className="avatar-circle-lg mx-auto mb-3 shadow-lg text-white fw-black" style={{ backgroundColor: stringToColor(selectedStudent.name) }}>{getInitials(selectedStudent.name)}</div>
                        <h4 className="fw-black mb-1" style={{ color: 'var(--primary-blue)' }}>{selectedStudent.name}</h4>
                        <p className="xx-small fw-bold text-muted font-monospace tracking-widest mb-4">{selectedStudent.regNumber}</p>
                        
                        <div className="row g-2 mb-4 text-start">
                          <div className="col-4"><div className="bg-light p-3 rounded-3 text-center"><GraduationCap size={20} className="text-primary mb-1 mx-auto" /><div className="xx-small fw-bold text-muted">STATUS</div><div className="small fw-black text-dark">ACTIVE</div></div></div>
                          <div className="col-4"><div className="bg-light p-3 rounded-3 text-center"><Calendar size={20} className="text-primary mb-1 mx-auto" /><div className="xx-small fw-bold text-muted">JOINED</div><div className="small fw-black text-dark">2024</div></div></div>
                          <div className="col-4"><div className="bg-light p-3 rounded-3 text-center"><History size={20} className="text-primary mb-1 mx-auto" /><div className="xx-small fw-bold text-muted">ATTEND</div><div className="small fw-black text-dark">0%</div></div></div>
                        </div>

                        <div className="d-flex flex-column gap-2">
                          <button className="btn btn-primary-unified w-100 py-3 rounded-3 fw-bold shadow-sm" onClick={handleEditClick}><Edit2 size={18} className="me-2" /> Edit Student</button>
                          <button className="btn btn-light w-100 py-3 rounded-3 fw-bold border" onClick={() => setSelectedStudent(null)}>Close View</button>
                          <button className="btn btn-link text-danger fw-bold xx-small text-decoration-none py-2" onClick={() => { if(confirm('Delete student record?')) { db.students.delete(selectedStudent.id!); setSelectedStudent(null); } }}>Delete Student</button>
                        </div>
                      </>
                    ) : (
                      <div className="text-start">
                        <h5 className="fw-bold mb-4">Edit Student</h5>
                        <div className="mb-3">
                          <label className="xx-small fw-bold text-muted">FULL NAME</label>
                          <input type="text" className="form-control modern-input-unified p-3 fw-bold" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                        </div>
                        <div className="mb-4">
                          <label className="xx-small fw-bold text-muted">REG NUMBER (10 Digits)</label>
                          <input type="text" className="form-control modern-input-unified p-3 fw-bold font-monospace" maxLength={10} value={editForm.regNumber} onChange={e => setEditForm({...editForm, regNumber: e.target.value})} />
                        </div>
                        <div className="d-flex gap-2">
                          <button className="btn btn-light flex-grow-1 py-3 fw-bold" onClick={() => setIsEditing(false)}>Cancel</button>
                          <button className="btn btn-success flex-grow-1 py-3 fw-bold shadow-sm" onClick={handleEditSave}><Save size={18} className="me-2" /> Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: '#fff', zIndex: 1050 }}>
          <div className="container-fluid h-100 p-0 d-flex flex-column">
            <div className="p-4 border-bottom d-flex align-items-center justify-content-between bg-white sticky-top">
              <div className="d-flex align-items-center gap-3">
                {importMode !== 'select' && <button className="btn btn-light rounded-circle p-2" onClick={resetImportState}><ArrowLeft size={20} /></button>}
                <div>
                  <h5 className="fw-black mb-0 text-primary">IMPORT CENTER</h5>
                  <p className="xx-small fw-bold text-muted mb-0">Add multiple students</p>
                </div>
              </div>
              <button type="button" className="btn-light rounded-circle p-2" onClick={() => setShowImportModal(false)}><X size={24} /></button>
            </div>

            <div className="flex-grow-1 overflow-auto bg-light">
              {showMapper && uploadedFile ? (
                <div className="p-4 bg-white h-100"><FileMapper file={uploadedFile} onComplete={handleMapperComplete} onCancel={() => { setShowMapper(false); setUploadedFile(null); }} /></div>
              ) : importMode === 'select' ? (
                <div className="p-4 d-flex flex-column gap-3 max-w-md mx-auto mt-4">
                  <div className="bg-primary-subtle p-3 rounded-3 border border-primary-subtle d-flex gap-3 mb-2">
                    <Info size={20} className="text-primary flex-shrink-0" />
                    <p className="xx-small text-primary-emphasis mb-0 fw-bold">RECOMMENDED: Use Smart Paste to copy directly from WhatsApp class lists.</p>
                  </div>
                  <button className="btn btn-white p-4 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4 hover-lift" onClick={() => setImportMode('manual')}><div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3"><Plus size={28} /></div><div><h5 className="fw-bold mb-1">Manual Entry</h5><p className="text-muted small mb-0">Single entry with scanner.</p></div></button>
                  <button className="btn btn-white p-4 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4 hover-lift" onClick={() => setImportMode('paste')}><div className="bg-warning bg-opacity-10 text-warning p-3 rounded-3"><ClipboardPaste size={28} /></div><div><h5 className="fw-bold mb-1">Smart Paste</h5><p className="text-muted small mb-0">Copy/Paste from WhatsApp.</p></div></button>
                  <button className="btn btn-white p-4 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4 hover-lift" onClick={() => setImportMode('file')}><div className="bg-success bg-opacity-10 text-success p-3 rounded-3"><FileText size={28} /></div><div><h5 className="fw-bold mb-1">Excel / CSV</h5><p className="text-muted small mb-0">For advanced users only.</p></div></button>
                </div>
              ) : importMode === 'manual' ? (
                <div className="p-4 max-w-md mx-auto">
                  {manualRows.map((row, idx) => (
                    <div key={idx} className={`card border-0 bg-white shadow-sm rounded-4 mb-3 ${row.error ? 'border-danger' : ''}`}>
                      <div className="card-body p-3">
                        <div className="d-flex justify-content-between mb-2"><span className="xx-small fw-black text-muted">ENTRY #{idx+1}</span>{manualRows.length > 1 && <button className="btn btn-link text-danger p-0" onClick={() => removeManualRow(idx)}><X size={14} /></button>}</div>
                        <div className="d-flex flex-column gap-3">
                          <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold" placeholder="FULL NAME" value={row.name} onChange={e => updateManualRow(idx, 'name', e.target.value)} /></div>
                          <div className="input-group modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold" placeholder="REG NUMBER (10 Digits)" maxLength={10} value={row.regNumber} onChange={e => updateManualRow(idx, 'regNumber', e.target.value)} /><button className="btn btn-light rounded-2 border-0" onClick={() => handleScanClick(idx)}><ScanLine size={18} className="text-primary" /></button></div>
                          {row.error && <div className="text-danger xx-small fw-bold d-flex align-items-center gap-1"><AlertTriangle size={12} /> {row.error}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-outline-primary w-100 py-3 rounded-4 border-dashed fw-bold" onClick={addManualRow}>+ Add Another Row</button>
                </div>
              ) : importMode === 'paste' ? (
                <div className="p-4 h-100 d-flex flex-column max-w-lg mx-auto">
                  {parsedStudents.length === 0 ? (
                    <div className="d-flex flex-column gap-3 h-100">
                      {parseError && <div className="alert alert-danger small fw-bold">{parseError}</div>}
                      <textarea className="form-control border-0 bg-white p-3 rounded-4 shadow-sm font-monospace flex-grow-1" style={{ minHeight: '300px', fontSize: '14px' }} placeholder="Paste names and numbers here..." value={pasteData} onChange={e => setPasteData(e.target.value)} />
                      <button className="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-lg" onClick={handleParse}>PROCESS TEXT</button>
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-center"><h6 className="fw-black text-success small mb-0">{parsedStudents.length} STUDENTS FOUND</h6><button className="btn btn-link text-danger xx-small fw-bold text-decoration-none" onClick={() => { setParsedStudents([]); setPasteData(''); setParseError(null); }}>RESET</button></div>
                      <div className="overflow-auto"><PreviewTable data={parsedStudents} setData={setParsedStudents} existingStudents={students || []} /></div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 text-center bg-white h-100 d-flex flex-column justify-content-center align-items-center">
                  <div className="bg-primary bg-opacity-10 text-primary p-4 rounded-circle mb-3"><Upload size={48} /></div>
                  <h5 className="fw-black">UPLOAD SPREADSHEET</h5>
                  <p className="xx-small fw-bold text-muted mb-4">EXCEL (.XLSX) OR CSV FILES</p>
                  <input type="file" accept=".csv, .xlsx, .xls" className="form-control opacity-0 position-absolute" id="file-up" style={{ width: '1px' }} onChange={handleFileUpload} />
                  <label htmlFor="file-up" className="btn btn-primary px-5 py-3 rounded-pill fw-bold shadow-lg">SELECT FILE</label>
                </div>
              )}
            </div>
            
            {importMode !== 'select' && !showMapper && (importMode === 'manual' || parsedStudents.length > 0) && (
              <div className="p-4 bg-white border-top shadow-lg sticky-bottom">
                <button 
                  className="btn btn-success w-100 py-3 rounded-4 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" 
                  onClick={handleSave} 
                  disabled={isSaving}
                >
                  {isSaving ? <div className="spinner-border spinner-border-sm" /> : <><CheckCircle2 size={20} /> SAVE TO DATABASE</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showScanner && <BarcodeScanner onScanSuccess={handleScanSuccess} onClose={() => setShowScanner(false)} />}

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .xx-small { font-size: 10px; }
        .text-gold { color: #cfb53b; }
        .avatar-circle { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .avatar-circle-lg { width: 80px; height: 80px; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 32px; }
        .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
        .shadow-inner { box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
        .shadow-top { box-shadow: 0 -4px 12px rgba(0,0,0,0.03); }
        .rounded-top-5 { border-top-left-radius: 32px; border-top-right-radius: 32px; }
        .btn-white-glass { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); backdrop-filter: blur(4px); }
        .max-w-md { max-width: 480px; }
        .max-w-lg { max-width: 600px; }
        .btn-primary-unified { background: linear-gradient(135deg, #0d6efd 0%, #0056b3 100%); border: none; color: #fff; }
      `}</style>
    </div>
  );
}

function PreviewTable({ data, setData, existingStudents }: { data: Student[], setData: (d: Student[]) => void, existingStudents: Student[] }) {
  return (
    <div className="d-flex flex-column gap-2">
      {data.map((s, idx) => {
        const isDup = existingStudents.some(ex => ex.regNumber === s.regNumber.replace(/\s/g, ''));
        const isInvalid = !/^\d{10}$/.test(s.regNumber.replace(/\s/g, ''));
        return (
          <div key={idx} className={`card border-0 p-2 shadow-sm ${isDup || isInvalid ? 'bg-warning-subtle' : 'bg-white'}`}>
            <div className="d-flex align-items-center gap-2 px-2">
              <input type="text" className="form-control form-control-sm border-0 bg-transparent fw-bold flex-grow-1 p-0" value={s.name} onChange={e => { const n = [...data]; n[idx].name = e.target.value; setData(n); }} />
              <div className="d-flex align-items-center gap-2">
                <input type="text" className="form-control form-control-sm border-0 bg-transparent font-monospace text-muted xx-small p-0 text-end" style={{ width: '100px' }} value={s.regNumber} onChange={e => { const n = [...data]; n[idx].regNumber = e.target.value; setData(n); }} />
                {isInvalid ? <span className="badge bg-danger text-white xx-small">INVALID</span> : isDup ? <span className="badge bg-warning text-dark xx-small">UPD</span> : <span className="badge bg-success-subtle text-success xx-small">NEW</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}