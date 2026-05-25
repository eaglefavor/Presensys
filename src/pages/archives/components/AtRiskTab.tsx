import { motion } from 'framer-motion';
import { AlertTriangle, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { SkeletonCard } from './ArchiveHelpers';
import type { CompilationRow } from './ArchiveTypes';

interface AtRiskTabProps {
  atRiskData: CompilationRow[];
  atRiskThreshold: number;
  atRiskTitle: string;
  atRiskStartDate: string;
  atRiskEndDate: string;
  showAtRiskExportMenu: boolean;
  setShowAtRiskExportMenu: (val: boolean) => void;
  handleAtRiskExport: (format: 'csv' | 'xlsx' | 'pdf' | 'text' | 'share') => void;
  loading: boolean;
}

export function AtRiskTab({
  atRiskData, atRiskThreshold, atRiskTitle, atRiskStartDate, atRiskEndDate,
  showAtRiskExportMenu, setShowAtRiskExportMenu, handleAtRiskExport,
  loading
}: AtRiskTabProps) {

  if (atRiskData.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="atrisk-empty" className="text-center py-5 mt-3">
        {loading ? (
          <div className="d-flex flex-column gap-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : (
          <>
            <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><AlertTriangle size={48} className="text-muted opacity-25" /></div>
            <h5 className="fw-black text-muted text-uppercase tracking-widest">At-Risk Report</h5>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Configure above and click FIND AT-RISK STUDENTS</p>
          </>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="atrisk">
      <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-3" style={{ borderLeft: '4px solid #dc3545' }}>
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <h5 className="fw-black text-danger text-uppercase letter-spacing-n1 mb-1">
              ⚠ {atRiskData.length} AT-RISK STUDENT{atRiskData.length !== 1 ? 'S' : ''} ({'<'}{atRiskThreshold}%)
            </h5>
            <p className="xx-small fw-bold text-muted uppercase tracking-widest mb-0">{atRiskTitle} | {atRiskStartDate} → {atRiskEndDate}</p>
          </div>
          <div className="position-relative">
            <button className="btn btn-danger btn-sm rounded-pill px-3 fw-black xx-small shadow-sm d-flex align-items-center gap-1" onClick={() => setShowAtRiskExportMenu(!showAtRiskExportMenu)}>
              <Download size={12} /> EXPORT
            </button>
            {showAtRiskExportMenu && (
              <div className="position-absolute end-0 mt-1 bg-white shadow-lg rounded-4 border p-2" style={{ zIndex: 200, minWidth: '200px' }}>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('csv')}><FileText size={14} className="text-success" /> CSV File</button>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('xlsx')}><FileSpreadsheet size={14} className="text-primary" /> Excel (XLSX)</button>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('pdf')}><FileText size={14} className="text-danger" /> Warning PDF</button>
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('text')}><FileText size={14} className="text-muted" /> Plain Text</button>
                <hr className="dropdown-divider my-1" />
                <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('share')}>Share</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="d-flex flex-column gap-2">
        {atRiskData.map((row, idx) => (
          <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="fw-black small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 bg-danger bg-opacity-10 text-danger"
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
            <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: 'var(--divider-color)' }}>
              <div className="h-100 rounded-pill bg-danger" style={{ width: `${row.percentage}%`, transition: 'width 0.5s ease' }} />
            </div>
            <div className="mt-1 d-flex justify-content-between">
              <span className="xx-small text-muted">{row.presentCount}/{row.totalSessions} sessions attended</span>
              <span className="xx-small fw-black text-danger">{atRiskThreshold - row.percentage}% below threshold</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
