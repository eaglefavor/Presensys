import { useState, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ClipboardPaste, Search, FileText, Upload, X, ScanLine, ArrowLeft, CheckCircle2, ChevronRight, GraduationCap, Calendar, History, Edit2, Save, Download, Trash2, Info, AlertTriangle, FingerprintPattern, KeyRound, Settings, User, Users } from 'lucide-react';
import { db, type Student } from '../db/db';
import FileMapper from '../components/FileMapper';
import BarcodeScanner from '../components/BarcodeScanner';
import ConfirmDialog from '../components/ConfirmDialog';
import FingerprintEnrollModal from '../components/FingerprintEnrollModal';
import SetPinModal from '../components/SetPinModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { assignOrResetStudentPin } from '../lib/pinBlitzService';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';
import autoTable from 'jspdf-autotable';

export default function Students() {
  const { user } = useAuthStore();
  const students = useLiveQuery(() => db.students.orderBy('name').filter(s => s.isDeleted !== 1).toArray());
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

  // Fingerprint enrollment
  const [showFingerprintModal, setShowFingerprintModal] = useState(false);
  const [showSetPinModal, setShowSetPinModal] = useState(false);
  const [showActionDropdown, setShowActionDropdown] = useState(false);
  const actionDropdownRef = useRef<HTMLDivElement>(null);

  // Live attendance stats for the selected student detail panel
  const selectedStudentStats = useLiveQuery(async () => {
    if (!selectedStudent) return null;
    const records = await db.attendanceRecords
      .where('studentId').equals(selectedStudent.serverId)
      .filter(r => r.isDeleted !== 1)
      .toArray();
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    return { total, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
  }, [selectedStudent]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  // Handle click outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionDropdownRef.current && !actionDropdownRef.current.contains(event.target as Node)) {
        setShowActionDropdown(false);
      }
    };

    if (showActionDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showActionDropdown]);

  // --- Bulk Selection Logic ---
  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
    if (newSet.size === 0 && !isSelectionMode) setIsSelectionMode(false);
  };

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmStudentDelete, setConfirmStudentDelete] = useState<Student | null>(null);

  const handleLongPress = (id: number) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
      if (window.navigator.vibrate) window.navigator.vibrate(50);
    }
  };

  const doBulkDelete = async () => {
    await db.transaction('rw', [db.students, db.enrollments, db.attendanceRecords], async () => {
      const ids = Array.from(selectedIds);
      const studentRecords = await db.students.where('id').anyOf(ids).toArray();
      const studentServerIds = studentRecords.map(s => s.serverId);
      
      await db.students.where('id').anyOf(ids).modify({ isDeleted: 1, synced: 0 });
      await db.enrollments.where('studentId').anyOf(studentServerIds).modify({ isDeleted: 1, synced: 0 });
      await db.attendanceRecords.where('studentId').anyOf(studentServerIds).modify({ isDeleted: 1, synced: 0 });
    });
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const doStudentDelete = async (student: Student) => {
    await db.transaction('rw', [db.students, db.enrollments, db.attendanceRecords], async () => {
      await db.students.update(student.id!, { isDeleted: 1 });
      await db.enrollments.where('studentId').equals(student.serverId).modify({ isDeleted: 1, synced: 0 });
      await db.attendanceRecords.where('studentId').equals(student.serverId).modify({ isDeleted: 1, synced: 0 });
    });
    setSelectedStudent(null);
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
      toast.error('Reg Number must be exactly 10 digits.');
      return;
    }
    await db.students.update(selectedStudent.id!, { name: editForm.name, regNumber: editForm.regNumber, userId: user?.id });
    setIsEditing(false);
    setSelectedStudent(null);
  };

  const handleResetPin = async () => {
    if (!selectedStudent) return;
    const ok = window.confirm(`Reset PIN for ${selectedStudent.name}? The old PIN will stop working immediately.`);
    if (!ok) return;
    try {
      const pinData = await assignOrResetStudentPin(selectedStudent.serverId);
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(pinData.pin);
          copied = true;
        }
      } catch {
        copied = false;
      }
      toast.success(copied ? `New PIN generated and copied: ${pinData.pin}` : `New PIN generated: ${pinData.pin}`);
    } catch (err) {
      console.error('PIN reset failed', err);
      toast.error('Failed to reset PIN.');
    }
  };

  const handleScanClick = (index: number) => {
    setActiveScanRowIndex(index);
    setShowScanner(true);
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

  const handleScanSuccess = useCallback((decodedText: string) => {
    const regNoMatch = decodedText.match(/(\d{10})/); 
    const finalValue = regNoMatch ? regNoMatch[0] : decodedText;
    if (activeScanRowIndex !== null) updateManualRow(activeScanRowIndex, 'regNumber', finalValue);
    setShowScanner(false);
    setActiveScanRowIndex(null);
  }, [activeScanRowIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScannerClose = useCallback(() => setShowScanner(false), []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setUploadedFile(file); setShowMapper(true); }
  };

  const handleMapperComplete = (data: { name: string; regNumber: string }[]) => {
    const studentsData = data.map(d => ({
      serverId: crypto.randomUUID(),
      name: d.name,
      regNumber: d.regNumber,
      isDeleted: 0,
      synced: 0
    } as Student));
    setParsedStudents(studentsData);
    setShowMapper(false);
    setUploadedFile(null);
    setImportMode('paste'); 
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
    const regNoRegex = /(\d{10})/;
    lines.forEach(line => {
      const match = line.match(regNoRegex);
      if (match) {
        const regNumber = match[0];
        const name = line.replace(regNumber, '').replace(/[,\t]/g, '').trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
        if (name.length > 2) results.push({
          serverId: crypto.randomUUID(),
          regNumber, 
          name,
          isDeleted: 0,
          synced: 0
        } as Student);
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
      const dataToSave = importMode === 'manual'
        ? manualRows.filter(r => r.name.trim() && r.regNumber.trim()).map(r => ({ serverId: crypto.randomUUID(), name: r.name, regNumber: r.regNumber, isDeleted: 0, synced: 0 } as Student))
        : parsedStudents;
      
      const validData: Student[] = [];
      const seenRegs = new Set();
      let hasErrors = false;

      const cleanedData = dataToSave.map(s => ({ ...s, regNumber: s.regNumber.replace(/\s/g, '') }));
      for (const s of cleanedData) {
        if (!/^\d{10}$/.test(s.regNumber)) {
          toast.error(`Invalid Reg Number: ${s.regNumber}. Must be exactly 10 digits.`);
          hasErrors = true; break;
        }
        if (seenRegs.has(s.regNumber)) {
          toast.error(`Duplicate in list: ${s.regNumber} appears twice.`);
          hasErrors = true; break;
        }
        seenRegs.add(s.regNumber);
        validData.push(s);
      }

      if (hasErrors || validData.length === 0) {
        setIsSaving(false); return;
      }
      
      await db.transaction('rw', db.students, async () => {
        const regNumbers = validData.map(s => s.regNumber);
        const existingRecords = regNumbers.length > 0
          ? await db.students.where('regNumber').anyOf(regNumbers).toArray()
          : [];
        const existingMap = new Map(existingRecords.map(r => [r.regNumber, r]));

        const toAdd: Student[] = [];
        const toRevive: { key: number; changes: Partial<Student> }[] = [];
        const toUpdate: { key: number; changes: Partial<Student> }[] = [];

        for (const s of validData) {
          const existing = existingMap.get(s.regNumber);
          if (!existing) {
            toAdd.push({ ...s, serverId: s.serverId || crypto.randomUUID(), userId: user.id, synced: 0 });
          } else if (existing.isDeleted === 1) {
            // Resurrect soft-deleted student: preserve their serverId (canonical UUID)
            toRevive.push({ key: existing.id!, changes: { name: s.name, isDeleted: 0, userId: user.id, synced: 0 } });
          } else {
            toUpdate.push({ key: existing.id!, changes: { name: s.name, userId: user.id, synced: 0 } });
          }
        }

        if (toAdd.length > 0) await db.students.bulkAdd(toAdd);
        if (toRevive.length > 0) await db.students.bulkUpdate(toRevive);
        if (toUpdate.length > 0) await db.students.bulkUpdate(toUpdate);
      });
      setShowImportModal(false);
      resetImportState();
    } catch (error) { 
      console.error(error); 
      toast.error('Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredStudents = students?.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.regNumber.includes(searchTerm));
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
      {/* Modern Header Section */}
      <div className="bg-white border-bottom px-4 px-lg-5 py-6 py-lg-7 mb-5" style={{ backgroundImage: 'linear-gradient(135deg, rgba(0, 105, 148, 0.02) 0%, rgba(0, 105, 148, 0.01) 100%)' }}>
        <div className="d-flex justify-content-between align-items-start gap-4 mb-5">
          <div className="flex-grow-1">
            <h1 className="h2 fw-black mb-2" style={{ color: 'var(--primary-blue)', letterSpacing: '-0.5px' }}>Student Records</h1>
            <p className="small fw-semibold text-muted mb-0">Manage and track all student information • Stay organized</p>
          </div>
          
          {/* Modern Action Dropdown Menu */}
          <div className="position-relative" ref={actionDropdownRef}>
            <button 
              className="btn btn-outline-primary rounded-pill px-4 py-2 fw-bold d-flex align-items-center gap-2 shadow-sm"
              onClick={() => setShowActionDropdown(!showActionDropdown)}
              aria-expanded={showActionDropdown}
              aria-haspopup="menu"
            >
              <Settings size={18} />
              <span className="d-none d-sm-inline">Actions</span>
              <ChevronRight size={16} className={`dropdown-chevron ${showActionDropdown ? 'dropdown-chevron-open' : ''}`} />
            </button>
            
            <AnimatePresence>
              {showActionDropdown && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="position-absolute end-0 bg-white rounded-3 shadow-lg border mt-2 py-2 dropdown-menu-actions"
                >
                  <button className="btn btn-link text-start w-100 px-3 py-2 fw-bold text-dark text-decoration-none d-flex align-items-center gap-2" onClick={() => { handleExportPDF(); setShowActionDropdown(false); }}>
                    <Download size={16} className="text-primary" /> Export PDF
                  </button>
                  <div className="dropdown-divider my-1 mx-2"></div>
                  <button className="btn btn-link text-start w-100 px-3 py-2 fw-bold text-dark text-decoration-none d-flex align-items-center gap-2" onClick={() => { setShowImportModal(true); resetImportState(); setShowActionDropdown(false); }}>
                    <Plus size={16} className="text-success" /> Add Students
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        {/* Modern Search Bar with Better Spacing */}
        <div className="modern-input-unified p-2 d-flex align-items-center bg-light shadow-sm" style={{ maxWidth: '100%' }}>
          <Search size={20} className="text-muted ms-3 flex-shrink-0" />
          <input
            type="text"
            className="form-control border-0 bg-transparent py-3 fw-medium ms-2"
            placeholder="Search by name or registration number..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchTerm && (
            <button className="btn btn-link p-0 text-muted" onClick={() => { setSearchTerm(''); setCurrentPage(1); }}>
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Student Grid Section */}
      <div className="px-4 px-lg-5 container-mobile">
        {/* Bulk Action Header - Improved Spacing */}
        {isSelectionMode && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-5 bg-primary-subtle rounded-4 d-flex justify-content-between align-items-center"
            style={{ backgroundColor: '#e6f2ff', border: '2px solid var(--primary-blue)' }}
          >
            <div className="d-flex align-items-center gap-4">
              <div className="bg-primary text-white p-3 rounded-3" style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={28} />
              </div>
              <div>
                <span className="fw-black text-primary" style={{ fontSize: '20px', display: 'block' }}>{selectedIds.size} Selected</span>
                <p className="small text-muted mb-0">Long press or click to select more</p>
              </div>
            </div>
            <button className="btn btn-link text-primary fw-bold p-0 text-decoration-none" onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}>Cancel</button>
          </motion.div>
        )}

        {/* Student Cards Grid - Spacious Layout */}
        <div className="row g-4 mb-5">
          {students == null ? (
            <div className="col-12">
              <div className="text-center py-8">
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <div className="spinner-border spinner-border-sm text-primary mb-3" role="status"></div>
                  <p className="text-muted small fw-bold">Loading students...</p>
                </motion.div>
              </div>
            </div>
          ) : displayedStudents && displayedStudents.length === 0 ? (
            <div className="col-12">
              <div className="text-center py-8">
                <div className="bg-light p-6 rounded-4">
                  <Users size={56} className="text-muted mx-auto mb-4 opacity-50" />
                  <h5 className="fw-black text-muted mb-2" style={{ fontSize: '18px' }}>No students found</h5>
                  <p className="small text-muted mb-4">{searchTerm ? 'Try adjusting your search' : 'Click "Add Students" to get started'}</p>
                  <button className="btn btn-primary rounded-pill px-4 fw-bold d-inline-flex align-items-center gap-2" onClick={() => { setShowImportModal(true); resetImportState(); }}>
                    <Plus size={18} /> Add Students
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {displayedStudents?.map(s => {
                const isSelected = selectedIds.has(s.id!);
                return (
                  <motion.div 
                    key={s.serverId} 
                    layout 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="col-12 col-sm-6 col-lg-4"
                  >
                    <motion.div 
                      className={`card border shadow-sm rounded-4 cursor-pointer transition-all h-100 position-relative overflow-hidden ${isSelected ? 'ring-2 ring-primary bg-primary-subtle' : 'bg-white hover-lift'}`}
                      style={{ padding: '24px', minHeight: '180px' }}
                      onContextMenu={(e) => { e.preventDefault(); handleLongPress(s.id!); }}
                      onClick={() => {
                        if (isSelectionMode) toggleSelection(s.id!);
                        else setSelectedStudent(s);
                      }}
                    >
                      {/* Selection Checkbox */}
                      <div className="position-absolute top-0 start-0 p-3" style={{ zIndex: 10 }}>
                        <motion.div 
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          className={`rounded-circle p-2 flex-shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-light text-muted'}`}
                          style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); toggleSelection(s.id!); }}
                        >
                          {isSelected ? <CheckCircle2 size={28} /> : <div style={{width: 32, height: 32, border: '2.5px solid #dee2e6', borderRadius: '50%'}}></div>}
                        </motion.div>
                      </div>

                      {/* Card Content */}
                      <div className="d-flex flex-column h-100">
                        <div className="d-flex align-items-start justify-content-between gap-3 mb-5">
                          <div className="d-flex align-items-center gap-3 flex-grow-1" style={{ marginTop: '8px' }}>
                            <div className="avatar-circle-md flex-shrink-0 text-white fw-black shadow-sm" style={{ backgroundColor: stringToColor(s.name) }}>
                              {getInitials(s.name)}
                            </div>
                            <div className="flex-grow-1 overflow-hidden">
                              <h5 className="fw-black mb-1 text-dark" style={{ fontSize: '16px' }}>{s.name}</h5>
                              <p className="small fw-bold text-muted mb-0 d-flex align-items-center gap-2">
                                <User size={14} /> {s.regNumber}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Pagination - Spacious */}
        {filteredStudents && filteredStudents.length > itemsPerPage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="d-flex justify-content-center align-items-center gap-4 mt-7 pt-6 pb-6"
          >
            <button 
              className="btn btn-outline-primary rounded-pill px-4 py-2 fw-bold" 
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
            >
              ← Previous
            </button>
            <span className="small fw-black text-muted" style={{ whiteSpace: 'nowrap' }}>Page <span style={{ color: 'var(--primary-blue)', fontSize: '18px', fontWeight: 'bold' }}>{currentPage}</span> of <span style={{ color: 'var(--primary-blue)', fontSize: '18px', fontWeight: 'bold' }}>{totalPages}</span></span>
            <button 
              className="btn btn-outline-primary rounded-pill px-4 py-2 fw-bold" 
              disabled={currentPage === totalPages} 
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
            >
              Next →
            </button>
          </motion.div>
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
            style={{ zIndex: 2000, borderTop: '3px solid var(--primary-blue)' }}
          >
            <div className="container-mobile d-flex gap-3">
              <button className="btn btn-light flex-grow-1 fw-bold rounded-pill py-3" onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}>Cancel</button>
              <button className="btn btn-danger flex-grow-1 fw-bold d-flex align-items-center justify-content-center gap-2 rounded-pill py-3" onClick={() => setConfirmBulkDelete(true)}>
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
                     <motion.div 
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="mx-auto mb-5"
                    >
                      <div className="avatar-circle-xl mx-auto shadow-lg fw-black" style={{ backgroundColor: 'var(--primary-blue)', color: '#cfb53b', border: '4px solid #cfb53b' }}>{getInitials(selectedStudent.name)}</div>
                    </motion.div>
                    
                    {/* Student Info */}
                    <div className="text-center mb-6">
                      <h2 className="fw-black mb-3" style={{ color: 'var(--primary-blue)', fontSize: '28px', letterSpacing: '-0.5px' }}>{selectedStudent.name}</h2>
                      <div className="badge bg-primary-subtle text-primary fw-bold mb-4" style={{ padding: '10px 16px', fontSize: '14px', border: '2px solid var(--primary-blue)', display: 'inline-block' }}>REG: {selectedStudent.regNumber}</div>
                    </div>
                    
                    {/* Statistics Cards - Improved Layout */}
                    <div className="row g-4 mb-6 text-center">
                      <div className="col-6">
                        <div className="bg-light p-5 rounded-4 border">
                         <GraduationCap size={28} className="mb-2 mx-auto text-primary" />
                         <div className="xx-small fw-bold text-muted mb-1">STATUS</div>
                         <div className="fw-black" style={{ color: 'var(--primary-blue)', fontSize: '18px' }}>ACTIVE</div>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="bg-light p-5 rounded-4 border">
                         <Calendar size={28} className="mb-2 mx-auto text-primary" />
                         <div className="xx-small fw-bold text-muted mb-1">JOINED</div>
                         <div className="fw-black" style={{ color: 'var(--primary-blue)', fontSize: '18px' }}>{selectedStudent.createdAt ? new Date(selectedStudent.createdAt).getFullYear() : '—'}</div>
                        </div>
                      </div>
                      <div className="col-12">
                        <div className="bg-light p-5 rounded-4 border">
                         <History size={28} className="mb-2 mx-auto text-primary" />
                         <div className="xx-small fw-bold text-muted mb-1">ATTENDANCE</div>
                         <div className="fw-black" style={{ color: 'var(--primary-blue)', fontSize: '24px' }}>{selectedStudentStats ? `${selectedStudentStats.percentage}%` : '…'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons - Organized and Spacious */}
                    <div className="d-flex flex-column gap-4">
                      <button className="btn btn-primary-unified w-100 py-4 rounded-4 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2" style={{ fontSize: '17px' }} onClick={handleEditClick}><Edit2 size={20} /> Edit Student</button>
                      
                      {/* Biometric & Security Section */}
                      <div className="bg-light-subtle p-5 rounded-4 border">
                        <h6 className="fw-black mb-4" style={{ color: 'var(--primary-blue)', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔒 Security & Biometrics</h6>
                        <div className="d-flex flex-column gap-3">
                         <button
                           className="btn btn-outline-primary w-100 py-3 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2"
                           onClick={() => setShowFingerprintModal(true)}
                           style={{ fontSize: '14px' }}
                         >
                           <FingerprintPattern size={18} />
                           Register/Update Fingerprint
                         </button>
                        </div>
                      </div>

                      {/* PIN Management Section */}
                      <div className="bg-light-subtle p-5 rounded-4 border">
                        <h6 className="fw-black mb-4" style={{ color: 'var(--primary-blue)', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔐 PIN Management</h6>
                        <div className="d-flex flex-column gap-3">
                         <button
                           className="btn btn-outline-info w-100 py-3 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2"
                           onClick={() => void handleResetPin()}
                           style={{ fontSize: '14px' }}
                         >
                           <KeyRound size={18} />
                           Reset PIN
                         </button>
                         <button
                           className="btn btn-info text-white w-100 py-3 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2"
                           onClick={() => setShowSetPinModal(true)}
                           style={{ fontSize: '14px' }}
                         >
                           <Edit2 size={18} />
                           Set PIN
                         </button>
                        </div>
                      </div>

                      {/* Danger Zone */}
                      <button className="btn btn-outline-danger w-100 py-3 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2" onClick={() => setConfirmStudentDelete(selectedStudent)} style={{ fontSize: '15px' }}>
                        <Trash2 size={18} /> Delete Student
                      </button>
                      
                      <button className="btn btn-light w-100 py-3 rounded-3 fw-bold" onClick={() => setSelectedStudent(null)}>Close</button>
                    </div>
                      </>
                    ) : (
                      <div className="text-start">
                        <h5 className="fw-black mb-6" style={{ fontSize: '20px', color: 'var(--primary-blue)' }}>Edit Student Information</h5>
                        <div className="mb-5">
                          <label className="xx-small fw-bold text-muted mb-2 d-block">FULL NAME</label>
                          <input type="text" className="form-control modern-input-unified p-4 fw-bold" style={{ fontSize: '16px' }} value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                        </div>
                        <div className="mb-5">
                          <label className="xx-small fw-bold text-muted mb-2 d-block">REG NUMBER (10 Digits)</label>
                          <input type="text" className="form-control modern-input-unified p-4 fw-bold font-monospace" style={{ fontSize: '16px' }} maxLength={10} value={editForm.regNumber} onChange={e => setEditForm({...editForm, regNumber: e.target.value})} />
                        </div>
                        <div className="d-flex gap-3">
                          <button className="btn btn-light flex-grow-1 py-3 fw-bold rounded-3" onClick={() => setIsEditing(false)}>Cancel</button>
                          <button className="btn btn-success flex-grow-1 py-3 fw-bold rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2" onClick={handleEditSave}><Save size={18} /> Save Changes</button>
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
            <div className="p-5 border-bottom d-flex align-items-center justify-content-between bg-white sticky-top">
              <div className="d-flex align-items-center gap-4">
                {importMode !== 'select' && (
                  <button className="btn btn-light rounded-circle p-2" onClick={resetImportState} aria-label="Back to import options">
                    <ArrowLeft size={20} />
                  </button>
                )}
                <div>
                  <h4 className="fw-black mb-1 text-primary" style={{ fontSize: '20px' }}>IMPORT CENTER</h4>
                  <p className="xx-small fw-bold text-muted mb-0">Add multiple students • Flexible import methods</p>
                </div>
              </div>
              <button type="button" className="btn-light rounded-circle p-2" onClick={() => setShowImportModal(false)} aria-label="Close import modal">
                <X size={24} />
              </button>
            </div>

            <div className="flex-grow-1 overflow-auto bg-light">
              {showMapper && uploadedFile ? (
                <div className="p-4 bg-white h-100"><FileMapper file={uploadedFile} onComplete={handleMapperComplete} onCancel={() => { setShowMapper(false); setUploadedFile(null); }} /></div>
              ) : importMode === 'select' ? (
                <div className="p-5 d-flex flex-column gap-4 max-w-md mx-auto mt-4 mb-6">
                  <div className="bg-primary-subtle p-4 rounded-4 border border-primary-subtle d-flex gap-3 mb-3">
                    <Info size={24} className="text-primary flex-shrink-0 mt-1" />
                    <p className="xx-small text-primary-emphasis mb-0 fw-bold">RECOMMENDED: Use Smart Paste to copy directly from WhatsApp class lists.</p>
                  </div>
                  <button className="btn btn-white p-5 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4 hover-lift transition-all" onClick={() => setImportMode('manual')}>
                    <div className="bg-primary bg-opacity-10 text-primary p-4 rounded-3 flex-shrink-0" style={{ fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px' }}>
                      <Plus size={32} />
                    </div>
                    <div>
                      <h6 className="fw-bold mb-2" style={{ fontSize: '16px' }}>Manual Entry</h6>
                      <p className="text-muted small mb-0">Single entry with scanner.</p>
                    </div>
                  </button>
                  <button className="btn btn-white p-5 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4 hover-lift transition-all" onClick={() => setImportMode('paste')}>
                    <div className="bg-warning bg-opacity-10 text-warning p-4 rounded-3 flex-shrink-0" style={{ fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px' }}>
                      <ClipboardPaste size={32} />
                    </div>
                    <div>
                      <h6 className="fw-bold mb-2" style={{ fontSize: '16px' }}>Smart Paste</h6>
                      <p className="text-muted small mb-0">Copy/Paste from WhatsApp.</p>
                    </div>
                  </button>
                  <button className="btn btn-white p-5 rounded-4 shadow-sm border-0 text-start d-flex align-items-center gap-4 hover-lift transition-all" onClick={() => setImportMode('file')}>
                    <div className="bg-success bg-opacity-10 text-success p-4 rounded-3 flex-shrink-0" style={{ fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px' }}>
                      <FileText size={32} />
                    </div>
                    <div>
                      <h6 className="fw-bold mb-2" style={{ fontSize: '16px' }}>Excel / CSV</h6>
                      <p className="text-muted small mb-0">For advanced users only.</p>
                    </div>
                  </button>
                </div>
              ) : importMode === 'manual' ? (
                <div className="p-5 max-w-md mx-auto mb-4">
                  {manualRows.map((row, idx) => (
                    <div key={idx} className={`card border-0 bg-white shadow-sm rounded-4 mb-4 ${row.error ? 'border-danger' : ''}`}>
                      <div className="card-body p-4">
                        <div className="d-flex justify-content-between mb-3"><span className="xx-small fw-black text-muted">ENTRY #{idx+1}</span>{manualRows.length > 1 && <button className="btn btn-link text-danger p-0" onClick={() => removeManualRow(idx)}><X size={14} /></button>}</div>
                        <div className="d-flex flex-column gap-4">
                          <div className="modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold" placeholder="FULL NAME" value={row.name} onChange={e => updateManualRow(idx, 'name', e.target.value)} /></div>
                          <div className="input-group modern-input-unified p-1"><input type="text" className="form-control border-0 bg-transparent fw-bold" placeholder="REG NUMBER (10 Digits)" maxLength={10} value={row.regNumber} onChange={e => updateManualRow(idx, 'regNumber', e.target.value)} /><button className="btn btn-light rounded-2 border-0" onClick={() => handleScanClick(idx)}><ScanLine size={18} className="text-primary" /></button></div>
                          {row.error && <div className="text-danger xx-small fw-bold d-flex align-items-center gap-1"><AlertTriangle size={12} /> {row.error}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-outline-primary w-100 py-3 rounded-4 border-dashed fw-bold mb-5" onClick={addManualRow}>+ Add Another Row</button>
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

      {showScanner && <BarcodeScanner onScanSuccess={handleScanSuccess} onClose={handleScannerClose} />}

      {showFingerprintModal && selectedStudent && (
        <FingerprintEnrollModal userId={user?.id || ''}
          student={selectedStudent}
          onClose={() => setShowFingerprintModal(false)}
        />
      )}

      {showSetPinModal && selectedStudent && (
        <SetPinModal
          student={selectedStudent}
          onClose={() => setShowSetPinModal(false)}
        />
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedIds.size} Student${selectedIds.size !== 1 ? 's' : ''}`}
        message="This will permanently remove the selected students, their enrollments, and attendance records. This cannot be undone."
        confirmLabel="Delete All"
        variant="danger"
        onConfirm={() => { doBulkDelete(); setConfirmBulkDelete(false); }}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <ConfirmDialog
        open={!!confirmStudentDelete}
        title="Delete Student"
        message={`Delete "${confirmStudentDelete?.name}"? Their enrollments and attendance records will also be removed.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (confirmStudentDelete) doStudentDelete(confirmStudentDelete); setConfirmStudentDelete(null); }}
        onCancel={() => setConfirmStudentDelete(null)}
      />

      <style>{`
        .text-gold { color: #cfb53b; }
        .avatar-circle { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .avatar-circle-md { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
        .avatar-circle-lg { width: 80px; height: 80px; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 32px; }
        .avatar-circle-xl { width: 120px; height: 120px; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 48px; }
        .btn-white-glass { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); backdrop-filter: blur(4px); }
        
        /* Dropdown Menu Styling */
        .dropdown-chevron { 
          transition: transform 0.2s ease;
        }
        .dropdown-chevron-open { 
          transform: rotate(90deg);
        }
        .dropdown-menu-actions { 
          min-width: 200px; 
          z-index: 1100;
        }
        
        /* Modern Design Enhancements */
        .hover-lift {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .hover-lift:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 105, 148, 0.15) !important;
        }
        
        .card {
          transition: all 0.3s ease;
        }
        .card:not(.bg-primary-subtle):hover {
          box-shadow: 0 8px 20px rgba(0, 105, 148, 0.1) !important;
          border: 1px solid var(--primary-blue) !important;
        }
        
        .cursor-pointer {
          cursor: pointer;
        }
        
        .transition-all {
          transition: all 0.3s ease;
        }
        
        .bg-primary-subtle {
          background-color: #e6f2ff !important;
        }
        
        .bg-light-subtle {
          background-color: #f8f9fa;
        }
        
        /* Smooth animations */
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-in {
          animation: slideUp 0.3s ease-out;
        }
        
        /* Dropdown styling */
        .z-1000 {
          z-index: 1000;
        }
        
        /* Better input styling */
        .modern-input-unified {
          transition: all 0.2s ease;
        }
        
        .modern-input-unified:focus-within {
          border-color: var(--primary-blue) !important;
          box-shadow: 0 0 0 3px rgba(0, 105, 148, 0.1) !important;
        }
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
