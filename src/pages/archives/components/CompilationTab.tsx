import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, FileSpreadsheet, ArrowUp, ArrowDown } from 'lucide-react';
import { SkeletonCard } from './ArchiveHelpers';
import type { CompilationRow, SortField, SortDir, FilterChip } from './ArchiveTypes';

interface CompilationTabProps {
  compilationData: CompilationRow[];
  compilationTitle: string;
  startDate: string;
  endDate: string;
  showExportMenu: boolean;
  setShowExportMenu: (val: boolean) => void;
  handleExport: (format: 'csv' | 'xlsx' | 'pdf' | 'text' | 'share' | 'semester') => void;
  filterChip: FilterChip;
  setFilterChip: (val: FilterChip) => void;
  sortField: SortField;
  sortDir: SortDir;
  handleSort: (field: SortField) => void;
  compilationPage: number;
  setCompilationPage: React.Dispatch<React.SetStateAction<number>>;
  compilationItemsPerPage: number;
  loading: boolean;
}

export function CompilationTab({
  compilationData, compilationTitle, startDate, endDate,
  showExportMenu, setShowExportMenu, handleExport,
  filterChip, setFilterChip,
  sortField, sortDir, handleSort,
  compilationPage, setCompilationPage, compilationItemsPerPage,
  loading
}: CompilationTabProps) {

  const displayedCompilation = useMemo(() => {
    let result = [...compilationData];
    if (filterChip === 'atrisk') result = result.filter(r => r.percentage < 75);
    else if (filterChip === 'perfect') result = result.filter(r => r.percentage === 100);
    else if (filterChip === 'excused') result = result.filter(r => r.excusedCount > 0);

    result.sort((a, b) => {
      const valA: string | number = a[sortField];
      const valB: string | number = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return result;
  }, [compilationData, filterChip, sortField, sortDir]);

  const compilationTotalPages = Math.max(1, Math.ceil(displayedCompilation.length / compilationItemsPerPage));
  const currentCompilationPage = displayedCompilation.slice((compilationPage - 1) * compilationItemsPerPage, compilationPage * compilationItemsPerPage);

  if (compilationData.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="compilation-empty" className="text-center py-5 mt-3">
        {loading ? (
          <div className="d-flex flex-column gap-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : (
          <>
            <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><FileText size={48} className="text-muted opacity-25" /></div>
            <h5 className="fw-black text-muted text-uppercase tracking-widest">Course Compilation</h5>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Select a course and date range above to view attendance records</p>
          </>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="compilation">

      <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-3" style={{ borderLeft: '4px solid #0d6efd' }}>
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h5 className="fw-black text-dark text-uppercase letter-spacing-n1 mb-1">{compilationTitle}</h5>
            <p className="xx-small fw-bold text-muted uppercase tracking-widest mb-0">{startDate} → {endDate}</p>
          </div>
          <div className="position-relative">
            <button className="btn btn-primary btn-sm rounded-pill px-3 fw-black xx-small shadow-sm d-flex align-items-center gap-1" onClick={() => setShowExportMenu(!showExportMenu)}>
              <Download size={12} /> EXPORT
            </button>
            {showExportMenu && (
              <div className="position-absolute end-0 mt-1 bg-white shadow-lg rounded-4 border p-2" style={{ zIndex: 200, minWidth: '210px' }}>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('csv')}><FileText size={14} className="text-success" /> CSV File</button>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('xlsx')}><FileSpreadsheet size={14} className="text-primary" /> Excel (XLSX)</button>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('pdf')}><FileText size={14} className="text-danger" /> PDF Document</button>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('text')}><FileText size={14} className="text-muted" /> Plain Text</button>
                <hr className="dropdown-divider my-1" />
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('share')}>Share List</button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="d-flex gap-2 flex-wrap pb-1 overflow-auto hide-scrollbar">
          <button className={`btn btn-sm rounded-pill fw-black xx-small px-3 flex-shrink-0 ${filterChip === '' ? 'btn-primary' : 'btn-light border'}`} onClick={() => { setFilterChip(''); setCompilationPage(1); }}>
            ALL ({compilationData.length})
          </button>
          <button className={`btn btn-sm rounded-pill fw-black xx-small px-3 flex-shrink-0 ${filterChip === 'atrisk' ? 'btn-primary' : 'btn-light border'}`} onClick={() => { setFilterChip('atrisk'); setCompilationPage(1); }}>
            AT-RISK ({compilationData.filter(r => r.percentage < 75).length})
          </button>
          <button className={`btn btn-sm rounded-pill fw-black xx-small px-3 flex-shrink-0 ${filterChip === 'perfect' ? 'btn-primary' : 'btn-light border'}`} onClick={() => { setFilterChip('perfect'); setCompilationPage(1); }}>
            PERFECT ({compilationData.filter(r => r.percentage === 100).length})
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0 px-1">
          Showing {displayedCompilation.length} students
        </h6>
        <div className="d-flex align-items-center gap-2">
          <span className="xx-small fw-bold text-muted">Sort:</span>
          <select
            className="form-select form-select-sm border-0 bg-transparent fw-black xx-small p-0 pe-3 w-auto"
            value={sortField}
            onChange={e => handleSort(e.target.value as SortField)}
          >
            <option value="name">NAME</option>
            <option value="regNumber">REG #</option>
            <option value="percentage">ATTENDANCE %</option>
            <option value="absentCount">ABSENCES</option>
          </select>
          <button className="btn btn-link btn-sm p-0 text-dark" onClick={() => handleSort(sortField)}>
            {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        </div>
      </div>

      <div className="d-flex flex-column gap-2">
        {currentCompilationPage.map((row, idx) => (
          <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className={`fw-black small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${row.percentage >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                style={{ width: '44px', height: '44px', fontSize: '12px' }}
              >
                {row.percentage}%
              </div>
              <div className="flex-grow-1 overflow-hidden">
                <h6 className="fw-bold mb-0 text-dark text-uppercase small letter-spacing-n1 text-truncate">{row.name}</h6>
                <div className="xx-small fw-black text-muted font-monospace tracking-widest">{row.regNumber}</div>
              </div>
              <div className="text-end flex-shrink-0">
                <div className="xx-small fw-black text-success">{row.presentCount}P</div>
                <div className="xx-small fw-black text-danger">{row.absentCount}A</div>
                {row.excusedCount > 0 && <div className="xx-small fw-black text-warning">{row.excusedCount}E</div>}
              </div>
            </div>
            <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: '#f1f3f5' }}>
              <div className={`h-100 rounded-pill ${row.percentage >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${row.percentage}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        ))}
      </div>

      {displayedCompilation.length > compilationItemsPerPage && (
        <div className="d-flex justify-content-between align-items-center mt-3 pb-3">
          <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={compilationPage === 1} onClick={() => setCompilationPage(p => p - 1)}>PREV</button>
          <span className="xx-small fw-black text-muted uppercase">Page {compilationPage} of {compilationTotalPages}</span>
          <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={compilationPage === compilationTotalPages} onClick={() => setCompilationPage(p => p + 1)}>NEXT</button>
        </div>
      )}

    </motion.div>
  );
}
