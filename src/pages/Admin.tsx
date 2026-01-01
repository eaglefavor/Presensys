import { useState } from 'react';
import { Plus, Ticket, Trash2, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Admin() {
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Fetch codes using a simple effect for now (or a custom hook)
  const [codes, setCodes] = useState<any[]>([]);

  const fetchCodes = async () => {
    const { data } = await supabase.from('access_codes').select('*').order('created_at', { ascending: false });
    if (data) setCodes(data);
  };

  useState(() => { fetchCodes(); });

  const generateCode = async () => {
    setLoading(true);
    // Generate a random 6-digit alphanumeric code
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const { error } = await supabase.from('access_codes').insert({
      code: newCode,
      created_by: (await supabase.auth.getUser()).data.user?.id
    });

    if (!error) {
      await fetchCodes();
    }
    setLoading(false);
  };

  const deleteCode = async (id: number) => {
    if (confirm('Delete this code?')) {
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
    <div className="animate-in">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold mb-0">Admin Console</h2>
        <button 
          className="btn btn-primary d-flex align-items-center gap-2 rounded-pill px-4"
          onClick={generateCode}
          disabled={loading}
        >
          <Plus size={20} /> Generate Code
        </button>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white py-3">
          <h6 className="mb-0 fw-bold text-uppercase small text-muted">Access Codes</h6>
        </div>
        <div className="list-group list-group-flush">
          {codes.map((c) => (
            <div key={c.id} className="list-group-item d-flex justify-content-between align-items-center py-3">
              <div className="d-flex align-items-center gap-3">
                <div className={`p-2 rounded-3 ${c.is_used ? 'bg-light text-muted' : 'bg-success-subtle text-success'}`}>
                  <Ticket size={20} />
                </div>
                <div>
                  <div className={`fw-mono fw-bold h5 mb-0 ${c.is_used ? 'text-muted text-decoration-line-through' : ''}`}>
                    {c.code}
                  </div>
                  <div className="small text-muted">
                    {c.is_used ? 'Used' : 'Available'} • {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="d-flex gap-2">
                {!c.is_used && (
                  <button 
                    className="btn btn-sm btn-light p-2 rounded-circle"
                    onClick={() => copyToClipboard(c.code, c.id)}
                  >
                    {copiedId === c.id ? <Check size={18} className="text-success" /> : <Copy size={18} />}
                  </button>
                )}
                <button 
                  className="btn btn-sm btn-light text-danger p-2 rounded-circle"
                  onClick={() => deleteCode(c.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
          {codes.length === 0 && (
            <div className="p-5 text-center text-muted">
              No access codes generated yet.
            </div>
          )}
        </div>
      </div>

      <div className="alert alert-info small d-flex gap-3">
        <Ticket size={24} className="flex-shrink-0" />
        <div>
          <strong>How it works:</strong> Generate a code and send it to a Course Rep. Once they use it, it will be marked as "Used" and cannot be reused.
        </div>
      </div>
    </div>
  );
}
