import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, ShieldAlert, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export default function VerifyAccess() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const profile = useAuthStore(state => state.profile);
  const signOut = useAuthStore(state => state.signOut);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.rpc('verify_access_code', { input_code: code });

    if (error) {
      setMessage(error.message);
      setIsError(true);
    } else {
      if (data.success) {
        // Force a re-fetch of the profile to update the global state
        await useAuthStore.getState().fetchProfile();
      } else {
        setMessage(data.message);
        setIsError(true);
        if (data.message.includes('terminated')) {
          // Force logout or show blocked screen
        }
      }
    }
    setLoading(false);
  };

  if (profile?.status === 'terminated') {
    return (
      <div className="text-center p-4 animate-in">
        <div className="bg-danger text-white d-inline-block p-3 rounded-circle mb-4">
          <ShieldAlert size={48} />
        </div>
        <h2 className="fw-bold text-danger">Account Terminated</h2>
        <p className="text-muted mb-4">This account has been permanently disabled due to multiple failed access code attempts.</p>
        <button className="btn btn-outline-dark" onClick={signOut}>Exit Application</button>
      </div>
    );
  }

  return (
    <div className="animate-in p-3 d-flex flex-column justify-content-center min-vh-100 pb-5">
      <div className="text-center mb-5">
        <div className="bg-warning text-dark d-inline-block p-3 rounded-4 shadow-lg mb-3">
          <KeyRound size={40} />
        </div>
        <h2 className="fw-bold">Activation Required</h2>
        <p className="text-muted">Enter the access code provided by the Admin</p>
      </div>

      <div className="card border-0 shadow-lg rounded-4 overflow-hidden mb-4">
        <div className="card-body p-4 text-center">
          <form onSubmit={handleVerify}>
            {message && (
              <div className={`alert ${isError ? 'alert-danger' : 'alert-success'} small py-2 mb-4`}>
                {message}
              </div>
            )}
            
            <div className="mb-4">
              <input 
                type="text" 
                className="form-control form-control-lg border-0 bg-light text-center fw-bold letter-spacing-2" 
                placeholder="000-000"
                required
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                style={{ fontSize: '1.5rem', letterSpacing: '4px' }}
              />
              <div className="mt-2 small text-muted">
                Invalid Tries: <span className="text-danger fw-bold">{profile?.invalid_tries || 0}</span> / 20
              </div>
            </div>

            <button className="btn btn-primary w-100 py-3 rounded-3 shadow mb-3" disabled={loading}>
              {loading ? 'Verifying...' : 'Activate Account'}
            </button>
          </form>
        </div>
      </div>

      <button className="btn btn-link text-muted d-flex align-items-center justify-content-center gap-2" onClick={signOut}>
        <LogOut size={18} /> Sign Out
      </button>
    </div>
  );
}
