import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, ShieldAlert, LogOut, Bug } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export default function VerifyAccess() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const profile = useAuthStore(state => state.profile);
  const session = useAuthStore(state => state.session);
  const profileVerified = useAuthStore(state => state.profileVerified);
  const signOut = useAuthStore(state => state.signOut);

  // Log the state every time the auth state changes
  useEffect(() => {
    console.group('%c[VerifyAccess] Component rendered / state updated', 'color:#d35400;font-weight:bold');
    console.log('session      :', session ? `✅ user=${session.user?.email}` : '❌ null');
    console.log('profileVerified:', profileVerified);
    console.log('profile      :', profile
      ? { id: profile.id, role: profile.role, status: profile.status, invalid_tries: profile.invalid_tries }
      : '⚠️ NULL — profile row missing?');
    if (profile?.status === 'terminated') {
      console.warn('⛔ Profile is TERMINATED — showing termination screen');
    } else if (profile?.status === 'verified') {
      console.warn('⚠️ Profile is VERIFIED but VerifyAccess is still showing — route guard may be stale!');
    } else {
      console.log('status is:', profile?.status ?? 'unknown (profile null)');
    }
    console.groupEnd();
  }, [session, profileVerified, profile]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    console.group('%c[VerifyAccess] handleVerify — submitting code', 'color:#c0392b;font-weight:bold');
    console.log('code entered :', code);
    console.log('profile before RPC:', profile
      ? { id: profile.id, role: profile.role, status: profile.status, invalid_tries: profile.invalid_tries }
      : 'NULL');
    console.log('session user id:', session?.user?.id ?? 'null');

    try {
      console.log('[VerifyAccess] Calling verify_access_code RPC…');
      const { data, error } = await supabase.rpc('verify_access_code', { input_code: code });
      console.log('[VerifyAccess] RPC raw response:');
      console.log('  error:', error);
      console.log('  data :', data);
      console.log('  typeof data:', typeof data);

      if (!data) {
        console.error('[VerifyAccess] data is null/undefined/falsy!');
        console.error('  This usually means the verify_access_code SQL function is NOT deployed in Supabase.');
        console.error('  error object:', JSON.stringify(error));
        setMessage(error?.message ?? 'Unexpected server response. Please try again.');
        setIsError(true);
      } else if (error) {
        console.error('[VerifyAccess] RPC returned both data and error — unusual. error:', error);
        setMessage(error.message);
        setIsError(true);
      } else if (data.success) {
        console.log('%c[VerifyAccess] ✅ Code accepted! data.message:', 'color:#27ae60', data.message);
        setMessage('Account verified! Setting up your dashboard…');
        setIsError(false);
        // Apply an optimistic update directly in the store rather than re-fetching
        // from the DB.  A re-fetch can return stale 'pending' data when the Supabase
        // read replica hasn't caught up with the RPC's UPDATE yet, which causes
        // refreshedStatus !== 'verified' and triggers a reload loop.
        // Trusting the SECURITY DEFINER RPC result is safe: if it returned
        // { success: true }, the primary DB row is already committed as 'verified'.
        const currentProfile = useAuthStore.getState().profile;
        console.log('[VerifyAccess] currentProfile before optimistic update:', currentProfile);
        if (currentProfile) {
          const verifiedProfile = { ...currentProfile, status: 'verified' as const, invalid_tries: 0 };
          console.log('[VerifyAccess] → applying optimistic update:', verifiedProfile);
          localStorage.setItem('user_profile', JSON.stringify(verifiedProfile));
          useAuthStore.setState({ profile: verifiedProfile, profileVerified: true });
          console.log('[VerifyAccess] → store updated. App route guard should now render <Layout />');
          // App.tsx's reactive route guard now sees status === 'verified' and
          // automatically switches to <Layout /> without any explicit navigation.
        } else {
          console.warn('[VerifyAccess] currentProfile is null — falling back to server fetch');
          // Profile wasn't in the store (very unusual) — fall back to server fetch.
          await useAuthStore.getState().fetchProfile();
          const refreshedStatus = useAuthStore.getState().profile?.status;
          console.log('[VerifyAccess] after fallback fetch, profile.status =', refreshedStatus);
          if (refreshedStatus !== 'verified') {
            console.warn('[VerifyAccess] still not verified after fetch — forcing reload');
            window.location.reload();
          }
        }
      } else {
        console.warn('%c[VerifyAccess] ❌ Code rejected — data.success=false', 'color:#e74c3c', 'message:', data.message);
        console.log('[VerifyAccess] full rejection data:', data);
        setMessage(data.message);
        setIsError(true);
        // Refresh the profile so the invalid_tries counter stays in sync with the DB
        await useAuthStore.getState().fetchProfile();
        const updatedProfile = useAuthStore.getState().profile;
        console.log('[VerifyAccess] profile after rejection refetch:', updatedProfile
          ? { status: updatedProfile.status, invalid_tries: updatedProfile.invalid_tries }
          : 'null');
        if (data.message.includes('terminated')) {
          console.warn('[VerifyAccess] account terminated — signing out in 2s');
          // The profile will reflect 'terminated' status; sign the user out
          // so they cannot re-enter the code entry screen on reload.
          setTimeout(() => useAuthStore.getState().signOut(), 2000);
        }
      }
    } catch (err) {
      console.error('[VerifyAccess] Unexpected exception in handleVerify:', err);
      setMessage('An unexpected error occurred. Please try again.');
      setIsError(true);
    }

    console.groupEnd();
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

      {/* ── Debug Overlay ──────────────────────────────────────────────────── */}
      <div className="mb-3">
        <button
          className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 mx-auto"
          onClick={() => setShowDebug(v => !v)}
        >
          <Bug size={14} /> {showDebug ? 'Hide' : 'Show'} Debug Info
        </button>
        {showDebug && (
          <div className="mt-2 p-3 rounded-3 border bg-light text-start" style={{ fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            <div className="fw-bold text-uppercase text-muted mb-2" style={{ letterSpacing: '1px' }}>Auth State (live)</div>
            <div><span className="text-muted">session:</span> {session ? `✅ ${session.user?.email}` : '❌ null'}</div>
            <div><span className="text-muted">user.id:</span> {session?.user?.id ?? 'null'}</div>
            <div><span className="text-muted">profileVerified:</span> {String(profileVerified)}</div>
            <div><span className="text-muted">profile.id:</span> {profile?.id ?? '⚠️ null'}</div>
            <div><span className="text-muted">profile.role:</span> {profile?.role ?? 'null'}</div>
            <div><span className="text-muted">profile.status:</span> <strong>{profile?.status ?? 'null'}</strong></div>
            <div><span className="text-muted">invalid_tries:</span> {profile?.invalid_tries ?? 'null'}</div>
            <hr className="my-2" />
            <div className="text-muted" style={{ fontSize: '10px' }}>Also call <strong>window.__presensysDebug()</strong> in Eruda console for full state.</div>
          </div>
        )}
      </div>
      {/* ───────────────────────────────────────────────────────────────────── */}

      <button className="btn btn-link text-muted d-flex align-items-center justify-content-center gap-2" onClick={signOut}>
        <LogOut size={18} /> Sign Out
      </button>
    </div>
  );
}
