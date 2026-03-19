import { useState, useEffect } from 'react';
import { Plus, Ticket, Trash2, Copy, Check, Users, ShieldCheck, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';

export default function Admin() {
  const [codes, setCodes] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, activeReps: 0, pendingUsers: 0 });
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    fetchCodes();
    fetchStats();
  }, []);

  const fetchCodes = async () => {
    const { data } = await supabase.from('access_codes').select('*').order('created_at', { ascending: false });
    if (data) setCodes(data);
  };

  const fetchStats = async () => {
    const { count: total } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: verified } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'verified');
    const { count: pending } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    setStats({ totalUsers: total || 0, activeReps: verified || 0, pendingUsers: pending || 0 });
  };

  const generateCode = async () => {
    setLoading(true);
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from('access_codes').insert({ code: newCode });
    if (!error) await fetchCodes();
    setLoading(false);
  };

  const deleteCode = async (id: number) => {
    if (confirm('Delete this access code?')) {
      await supabase.from('access_codes').delete().eq('id', id);
      await fetchCodes();
    }
  };

  const copyToClipboard = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="admin-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <h1 className="h4 fw-black mb-0 text-primary" style={{ color: 'var(--primary-blue)' }}>ADMIN CONSOLE</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">System Overview</p>
      </div>

      <div className="px-4 container-mobile">
        {/* Stats Grid */}
        <div className="row g-3 mb-4">
          <div className="col-12">
            <div className="card border-0 bg-primary text-white p-4 rounded-4 shadow-lg position-relative overflow-hidden">
              <div className="position-absolute top-0 end-0 p-3 opacity-10"><Users size={100} /></div>
              <div className="position-relative z-10">
                <div className="xx-small fw-bold text-uppercase tracking-widest mb-1 opacity-75">Total Users</div>
                <h1 className="display-4 fw-black mb-0 letter-spacing-n1">{stats.totalUsers}</h1>
                <div className="d-flex gap-3 mt-3">
                  <div className="d-flex align-items-center gap-1 small"><ShieldCheck size={16} /> <strong>{stats.activeReps}</strong> Active</div>
                  <div className="d-flex align-items-center gap-1 small text-warning"><Activity size={16} /> <strong>{stats.pendingUsers}</strong> Pending</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Access Code Management */}
        <div className="d-flex justify-content-between align-items-center mb-3 px-1">
          <h6 className="fw-black text-muted text-uppercase tracking-widest mb-0">Access Codes</h6>
          <button className="btn btn-primary rounded-pill px-4 py-2 shadow-sm fw-bold d-flex align-items-center gap-2" onClick={generateCode} disabled={loading}>
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
                    <button className="btn btn-light rounded-circle p-2 text-primary" onClick={() => copyToClipboard(c.code, c.id)}>
                      {copiedId === c.id ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  )}
                  <button className="btn btn-light rounded-circle p-2 text-danger" onClick={() => deleteCode(c.id)}>
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
      </div>

      <style>{`
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1.2px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }
      `}</style>
    </div>
  );
}