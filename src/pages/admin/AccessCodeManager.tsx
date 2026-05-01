import { Plus, Ticket, Trash2, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

interface AccessCode {
  id: number;
  code: string;
  is_used: boolean;
  created_at: string;
}

interface AccessCodeManagerProps {
  codes: AccessCode[];
  loading: boolean;
  copiedId: number | null;
  onGenerateCode: () => void;
  onCopyCode: (code: string, id: number) => void;
  onDeleteCode: (id: number) => void;
}

export default function AccessCodeManager({
  codes,
  loading,
  copiedId,
  onGenerateCode,
  onCopyCode,
  onDeleteCode
}: AccessCodeManagerProps) {
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3 px-1">
        <h6 className="fw-black text-muted text-uppercase tracking-widest mb-0">Access Codes</h6>
        <button className="btn btn-primary rounded-pill px-4 py-2 shadow-sm fw-bold d-flex align-items-center gap-2" onClick={onGenerateCode} disabled={loading}>
          <Plus size={18} /> {loading ? 'Generating...' : 'New Code'}
        </button>
      </div>

      <div className="d-flex flex-column gap-2">
        {codes.map((c) => (
          <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <div className={`p-2 rounded-3 ${c.is_used ? 'bg-light text-muted' : 'bg-success-subtle text-success'}`}>
                  <Ticket size={24} />
                </div>
                <div>
                  <div className={`h5 fw-black font-monospace mb-0 ${c.is_used ? 'text-muted text-decoration-line-through' : 'text-dark'}`}>{c.code}</div>
                  <div className="xx-small fw-bold text-muted text-uppercase">{c.is_used ? 'Used' : 'Available'} • {new Date(c.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="d-flex gap-1">
                {!c.is_used && (
                  <button className="btn btn-light rounded-circle p-2 text-primary" onClick={() => onCopyCode(c.code, c.id)}>
                    {copiedId === c.id ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                )}
                <button className="btn btn-light rounded-circle p-2 text-danger" onClick={() => onDeleteCode(c.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
        {codes.length === 0 && (
          <div className="text-center py-5 bg-white rounded-4 border-dashed">
            <p className="xx-small fw-bold text-muted uppercase mb-0">No active codes generated</p>
          </div>
        )}
      </div>
    </>
  );
}
