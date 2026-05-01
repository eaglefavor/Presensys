import { GraduationCap, Building, Layers, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { FACULTIES, LEVELS, getDepartments } from '../../../lib/unizikData';

interface AcademicInfoSectionProps {
  faculty: string;
  department: string;
  level: string;
  savingAcademic: boolean;
  handleFacultyChange: (faculty: string) => void;
  setDepartment: (department: string) => void;
  setLevel: (level: string) => void;
  handleSaveAcademic: (e: React.FormEvent) => void;
}

export function AcademicInfoSection({
  faculty,
  department,
  level,
  savingAcademic,
  handleFacultyChange,
  setDepartment,
  setLevel,
  handleSaveAcademic
}: AcademicInfoSectionProps) {
  const availableDepartments = faculty ? getDepartments(faculty) : [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <div className="d-flex align-items-center gap-2 mb-3 px-1">
        <GraduationCap size={14} className="text-muted" />
        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">Academic Information</h6>
      </div>

      <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4">
        <form onSubmit={handleSaveAcademic}>
          <div className="mb-3">
            <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">
              <Building size={10} className="me-1" /> Faculty
            </label>
            <select
              className="form-select rounded-3 fw-bold border-light bg-light py-2"
              value={faculty}
              onChange={e => handleFacultyChange(e.target.value)}
            >
              <option value="">Select Faculty...</option>
              {FACULTIES.map(f => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">
              <Layers size={10} className="me-1" /> Department
            </label>
            <select
              className="form-select rounded-3 fw-bold border-light bg-light py-2"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              disabled={!faculty}
            >
              <option value="">{faculty ? 'Select Department...' : 'Select a Faculty first'}</option>
              {availableDepartments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">
              <GraduationCap size={10} className="me-1" /> Level
            </label>
            <select
              className="form-select rounded-3 fw-bold border-light bg-light py-2"
              value={level}
              onChange={e => setLevel(e.target.value)}
            >
              <option value="">Select Level...</option>
              {LEVELS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <button className="btn btn-primary w-100 py-3 rounded-pill fw-black shadow-lg d-flex align-items-center justify-content-center gap-2 text-uppercase letter-spacing-n1" disabled={savingAcademic}>
            {savingAcademic ? (
              <div className="spinner-border spinner-border-sm" role="status"></div>
            ) : (
              <>Save Academic Info <ChevronRight size={18} /></>
            )}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
