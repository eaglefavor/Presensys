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
    <div className="auth-page animate-in">
      <div className="auth-hero text-center py-5 px-4 text-white shadow-lg mb-4">
        <div className="brand-icon-wrapper mb-3 mx-auto shadow-sm">
          <ShieldCheck size={42} className="text-warning" />
        </div>
        <h1 className="fw-black mb-1 letter-spacing-n1 h2">PRESENSYS</h1>
        <p className="opacity-75 x-small fw-bold text-uppercase tracking-widest mb-0">UNIZIK Digital Attendance</p>
      </div>

      <div className="px-3 pb-5 container-mobile">
        {/* Mode Switcher Dial */}
        <div className="mode-switcher-wrapper mb-4 p-1 shadow-sm border">
          <button 
            className={`mode-btn ${isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(true); navigate('/login'); }}
          >
            Sign In
          </button>
          <button 
            className={`mode-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(false); navigate('/signup'); }}
          >
            Register
          </button>
        </div>

        <div className="auth-card card border-0 shadow-xl rounded-5 overflow-hidden mb-4">
          <div className="card-body p-4">
            
            {/* Google First Section */}
            <div className="position-relative mb-4">
              <button 
                className="btn btn-google-premium w-100 py-3 rounded-4 shadow-sm"
                onClick={handleGoogleLogin}
              >
                <div className="google-icon-box me-3">
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                </div>
                <span className="fw-bold">Continue with Google</span>
                <span className="faster-tag">Faster</span>
              </button>
            </div>

            <div className="separator mb-4">
              <span className="separator-text px-3">or use email access</span>
            </div>

            <form onSubmit={handleAuth}>
              {error && (
                <div className="alert alert-danger border-0 rounded-3 small py-2 mb-3 d-flex align-items-center gap-2">
                  <div className="bg-danger rounded-circle p-1" style={{width: '6px', height: '6px'}}></div>
                  {error}
                </div>
              )}
              
              {!isLogin && (
                <div className="mb-3">
                  <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">Full Name</label>
                  <div className="input-group modern-input-unified">
                    <span className="input-group-text"><User size={18} /></span>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="John Doe"
                      required={!isLogin}
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="mb-3">
                <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">University Email</label>
                <div className="input-group modern-input-unified">
                  <span className="input-group-text"><Mail size={18} /></span>
                  <input 
                    type="email" 
                    className="form-control" 
                    placeholder="name@email.com"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center">
                  <label className="form-label x-small fw-bold text-uppercase text-muted ps-1">Password</label>
                </div>
                <div className="input-group modern-input-unified">
                  <span className="input-group-text"><Lock size={18} /></span>
                  <input 
                    type="password" 
                    className="form-control" 
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {!isLogin && (
                <div className="bg-light p-3 rounded-4 mb-4 d-flex gap-3 align-items-start border border-light">
                  <Info size={18} className="text-primary mt-1 flex-shrink-0" />
                  <p className="xx-small text-muted mb-0 fw-medium">
                    New accounts require an <strong>Access Code</strong> from the Admin for dashboard activation.
                  </p>
                </div>
              )}

              <button className="btn btn-primary-unified w-100 py-3 rounded-4 fw-bold shadow-lg d-flex align-items-center justify-content-center gap-2" disabled={loading}>
                {loading ? (
                  <div className="spinner-border spinner-border-sm" role="status"></div>
                ) : (
                  <>{isLogin ? 'Sign In' : 'Create Account'} <ChevronRight size={18} /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          background-color: #fcfcfd;
        }
        .auth-hero {
          background: linear-gradient(135deg, #0d6efd 0%, #0046af 100%);
          border-bottom-left-radius: 40px !important;
          border-bottom-right-radius: 40px !important;
        }
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1.2px; }
        .x-small { font-size: 11px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 3px; }
        
        .brand-icon-wrapper {
          width: 76px;
          height: 76px;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(8px);
          border-radius: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.2);
        }

        /* Mode Switcher Dial */
        .mode-switcher-wrapper {
          display: flex;
          background: #f1f3f5;
          border-radius: 100px;
          max-width: 240px;
          margin: 0 auto;
        }
        .mode-btn {
          flex: 1;
          border: none;
          background: transparent;
          padding: 10px 15px;
          font-size: 13px;
          font-weight: 700;
          color: #adb5bd;
          border-radius: 100px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .mode-btn.active {
          background: #fff;
          color: #0d6efd;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        /* Google Button Premium */
        .btn-google-premium {
          position: relative;
          background: #fff;
          border: 1px solid #e1e4e8;
          color: #3c4043;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .btn-google-premium:hover {
          background: #f8f9fa;
          border-color: #d1d4d8;
        }
        .google-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .faster-tag {
          position: absolute;
          top: -8px;
          right: 12px;
          background: #198754;
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 50px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 8px rgba(25,135,84,0.3);
          border: 2px solid #fff;
        }

        .modern-input-unified {
          background: #f8f9fa;
          border-radius: 14px;
          overflow: hidden;
          border: 1.5px solid transparent;
          transition: all 0.2s ease;
        }
        .modern-input-unified:focus-within {
          border-color: #0d6efd;
          background: #fff;
          box-shadow: 0 8px 20px rgba(13,110,253,0.06);
        }
        .modern-input-unified .input-group-text {
          background: transparent;
          border: none;
          color: #ced4da;
          padding-left: 1.25rem;
        }
        .modern-input-unified .form-control {
          background: transparent;
          border: none;
          padding: 0.9rem 1.25rem 0.9rem 0;
          font-weight: 500;
          font-size: 15px;
        }
        .modern-input-unified .form-control:focus { box-shadow: none; }

        .btn-primary-unified {
          background: linear-gradient(135deg, #0d6efd 0%, #0056b3 100%);
          border: none;
          color: #fff;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .btn-primary-unified:active {
          transform: scale(0.98);
        }

        .separator {
          position: relative;
          text-align: center;
        }
        .separator::before {
          content: "";
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: #e9ecef;
        }
        .separator-text {
          position: relative;
          background: #fff;
          color: #adb5bd;
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 1px;
        }
      `}</style>
    </div>
  );
}
