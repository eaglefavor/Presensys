import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User, ChevronRight, Info, ShieldCheck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(location.pathname === '/login' || !location.pathname.includes('signup'));
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLogin(location.pathname !== '/signup');
  }, [location.pathname]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        navigate('/');
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin
        }
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        alert('Verification email sent! Check your inbox.');
        setIsLogin(true);
        setLoading(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) setError(error.message);
  };

  return (
    <div className="auth-page animate-in min-vh-100 bg-white d-flex flex-column">
      {/* Brand Header */}
      <div className="text-center py-5 px-4 mt-4">
        <div className="brand-icon-wrapper mb-3 mx-auto" style={{ backgroundColor: 'rgba(0, 105, 148, 0.05)', border: 'none' }}>
          <ShieldCheck size={42} style={{ color: 'var(--primary-blue)' }} />
        </div>
        <h1 className="fw-black mb-1 letter-spacing-n1 h2" style={{ color: 'var(--primary-blue)' }}>PRESENSYS</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">University Attendance Portal</p>
      </div>

      <div className="px-4 pb-5 container-mobile flex-grow-1">
        {/* Google First Section */}
        <div className="position-relative mb-4">
          <button 
            className="btn w-100 py-3 rounded-3 border fw-bold d-flex align-items-center justify-content-center gap-3 bg-white"
            onClick={handleGoogleLogin}
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-dark)' }}
          >
            <div className="google-icon-box">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
            Continue with Google
            <span className="badge bg-success xx-small ms-auto">FASTER</span>
          </button>
        </div>

        <div className="text-center mb-4 d-flex align-items-center gap-3">
          <div className="flex-grow-1 border-bottom" style={{ height: '1px' }}></div>
          <span className="xx-small fw-bold text-uppercase text-muted tracking-wider">or email access</span>
          <div className="flex-grow-1 border-bottom" style={{ height: '1px' }}></div>
        </div>

        {/* Mode Switcher Dial (Simplistic) */}
        <div className="bg-light p-1 rounded-3 mb-4 d-flex" style={{ border: '1px solid var(--border-color)' }}>
          <button 
            className={`flex-fill border-0 py-2 rounded-2 small fw-bold transition-all ${isLogin ? 'bg-white shadow-sm' : 'bg-transparent text-muted'}`}
            onClick={() => { setIsLogin(true); navigate('/login'); }}
            style={isLogin ? { color: 'var(--primary-blue)' } : {}}
          >
            Sign In
          </button>
          <button 
            className={`flex-fill border-0 py-2 rounded-2 small fw-bold transition-all ${!isLogin ? 'bg-white shadow-sm' : 'bg-transparent text-muted'}`}
            onClick={() => { setIsLogin(false); navigate('/signup'); }}
            style={!isLogin ? { color: 'var(--primary-blue)' } : {}}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleAuth} className="mb-4">
          {error && (
            <div className="alert alert-danger border-0 rounded-3 small py-2 mb-3">
              {error}
            </div>
          )}
          
          {!isLogin && (
            <div className="mb-3">
              <label className="x-small fw-bold text-uppercase text-muted mb-1 ps-1">Full Name</label>
              <div className="input-group modern-input-unified">
                <span className="input-group-text bg-transparent border-0"><User size={18} className="text-muted" /></span>
                <input 
                  type="text" className="form-control border-0 bg-transparent py-3" placeholder="John Doe"
                  required={!isLogin} value={fullName} onChange={e => setFullName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="x-small fw-bold text-uppercase text-muted mb-1 ps-1">Email Address</label>
            <div className="input-group modern-input-unified">
              <span className="input-group-text bg-transparent border-0"><Mail size={18} className="text-muted" /></span>
              <input 
                type="email" className="form-control border-0 bg-transparent py-3" placeholder="name@email.com"
                required value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="x-small fw-bold text-uppercase text-muted mb-1 ps-1">Password</label>
            <div className="input-group modern-input-unified">
              <span className="input-group-text bg-transparent border-0"><Lock size={18} className="text-muted" /></span>
              <input 
                type="password" className="form-control border-0 bg-transparent py-3" placeholder="••••••••"
                required value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          {!isLogin && (
            <div className="bg-light p-3 rounded-3 mb-4 border d-flex gap-2">
              <Info size={16} className="text-primary flex-shrink-0 mt-1" />
              <p className="xx-small text-muted mb-0 fw-bold">Verification code will be required after account creation.</p>
            </div>
          )}

          <button className="btn btn-primary w-100 py-3 rounded-3 shadow-sm fw-bold d-flex align-items-center justify-content-center gap-2" disabled={loading}>
            {loading ? <div className="spinner-border spinner-border-sm" /> : <>{isLogin ? 'Sign In' : 'Create Account'} <ChevronRight size={18} /></>}
          </button>
        </form>
      </div>

      <div className="p-4 text-center mt-auto">
        <p className="xx-small text-muted fw-bold text-uppercase tracking-widest">Powered by Presensys Lab</p>
      </div>
    </div>
  );
}