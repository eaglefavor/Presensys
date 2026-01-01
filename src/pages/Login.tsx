import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Chrome, ChevronRight, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/');
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
      {/* Brand Hero Area */}
      <div className="auth-hero text-center py-5 px-4 bg-primary text-white rounded-bottom-5 shadow mb-4">
        <div className="brand-icon-wrapper mb-3 mx-auto">
          <ShieldCheck size={48} className="text-warning" />
        </div>
        <h1 className="fw-black mb-1 letter-spacing-n1">PRESENSYS</h1>
        <p className="opacity-75 small fw-medium text-uppercase tracking-wider">UNIZIK Digital Attendance</p>
      </div>

      <div className="px-3 pb-5">
        <div className="auth-card card border-0 shadow-lg rounded-4 overflow-hidden mb-4">
          <div className="card-body p-4">
            <div className="mb-4">
              <h4 className="fw-bold text-dark mb-1">Welcome Back</h4>
              <p className="text-muted small">Sign in to continue to your dashboard</p>
            </div>

            <form onSubmit={handleLogin}>
              {error && (
                <div className="alert alert-danger-subtle border-0 small py-2 d-flex align-items-center gap-2 mb-3">
                  <div className="bg-danger rounded-circle p-1" style={{width: '6px', height: '6px'}}></div>
                  {error}
                </div>
              )}
              
              <div className="mb-3">
                <label className="form-label x-small fw-bold text-uppercase text-muted">University Email</label>
                <div className="input-group modern-input">
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
                  <label className="form-label x-small fw-bold text-uppercase text-muted">Password</label>
                  <Link to="/forgot" className="x-small text-decoration-none fw-bold">Forgot?</Link>
                </div>
                <div className="input-group modern-input">
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

              <button className="btn btn-primary w-100 py-3 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2" disabled={loading}>
                {loading ? 'Authenticating...' : (
                  <>Sign In <ChevronRight size={18} /></>
                )}
              </button>
            </form>

            <div className="separator my-4">
              <span className="separator-text">secured social login</span>
            </div>

            <button 
              className="btn btn-outline-dark w-100 py-2 rounded-3 d-flex align-items-center justify-content-center gap-2 mb-2 border-2 fw-bold"
              onClick={handleGoogleLogin}
            >
              <Chrome size={20} className="text-danger" /> Google Account
            </button>
          </div>
        </div>

        <div className="text-center">
          <p className="text-muted small">
            New to the platform? <Link to="/signup" className="text-primary fw-bold text-decoration-none border-bottom border-primary border-2">Create Account</Link>
          </p>
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          background-color: #fcfcfd;
        }
        .auth-hero {
          background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%);
          border-bottom-left-radius: 40px !important;
          border-bottom-right-radius: 40px !important;
        }
        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .tracking-wider { letter-spacing: 2px; }
        .x-small { font-size: 11px; }
        
        .brand-icon-wrapper {
          width: 80px;
          height: 80px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(10px);
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.2);
        }

        .modern-input {
          background: #f8f9fa;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #eee;
          transition: all 0.2s;
        }
        .modern-input:focus-within {
          border-color: #0d6efd;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(13,110,253,0.05);
        }
        .modern-input .input-group-text {
          background: transparent;
          border: none;
          color: #adb5bd;
          padding-left: 1rem;
        }
        .modern-input .form-control {
          background: transparent;
          border: none;
          padding: 0.8rem 1rem 0.8rem 0;
          font-weight: 500;
        }
        .modern-input .form-control:focus {
          box-shadow: none;
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
          background: #eee;
        }
        .separator-text {
          position: relative;
          background: #fff;
          padding: 0 1rem;
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