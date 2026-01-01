import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Mail, Lock, User, ChevronRight, Info } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
      navigate('/login');
    }
  };

  return (
    <div className="auth-page animate-in">
      <div className="auth-hero text-center py-5 px-4 bg-success text-white rounded-bottom-5 shadow mb-4">
        <div className="brand-icon-wrapper mb-3 mx-auto">
          <UserPlus size={48} className="text-warning" />
        </div>
        <h1 className="fw-black mb-1 letter-spacing-n1">JOIN US</h1>
        <p className="opacity-75 small fw-medium text-uppercase tracking-wider">Representative Portal</p>
      </div>

      <div className="px-3 pb-5">
        <div className="auth-card card border-0 shadow-lg rounded-4 overflow-hidden mb-4">
          <div className="card-body p-4">
            <div className="mb-4">
              <h4 className="fw-bold text-dark mb-1">Create Account</h4>
              <p className="text-muted small">Step 1 of 2: Basic Information</p>
            </div>

            <form onSubmit={handleSignup}>
              {error && (
                <div className="alert alert-danger-subtle border-0 small py-2 d-flex align-items-center gap-2 mb-3">
                  <div className="bg-danger rounded-circle p-1" style={{width: '6px', height: '6px'}}></div>
                  {error}
                </div>
              )}
              
              <div className="mb-3">
                <label className="form-label x-small fw-bold text-uppercase text-muted">Full Name</label>
                <div className="input-group modern-input">
                  <span className="input-group-text"><User size={18} /></span>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="John Doe"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label x-small fw-bold text-uppercase text-muted">Email Address</label>
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
                <label className="form-label x-small fw-bold text-uppercase text-muted">Password</label>
                <div className="input-group modern-input">
                  <span className="input-group-text"><Lock size={18} /></span>
                  <input 
                    type="password" 
                    className="form-control" 
                    placeholder="Min 6 characters"
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="bg-primary-subtle p-3 rounded-4 mb-4 d-flex gap-3 align-items-start border border-primary-subtle">
                <Info size={20} className="text-primary mt-1" />
                <p className="x-small text-primary-emphasis mb-0 fw-medium">
                  After signup, you'll need an <strong>Access Code</strong> from the Admin to fully activate your dashboard features.
                </p>
              </div>

              <button className="btn btn-success w-100 py-3 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2" disabled={loading}>
                {loading ? 'Creating Account...' : (
                  <>Register Now <ChevronRight size={18} /></>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="text-center">
          <p className="text-muted small">
            Already have an account? <Link to="/login" className="text-success fw-bold text-decoration-none border-bottom border-success border-2">Sign In here</Link>
          </p>
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          background-color: #fcfcfd;
        }
        .auth-hero {
          background: linear-gradient(135deg, #198754 0%, #157347 100%);
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
          border-color: #198754;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(25,135,84,0.05);
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
      `}</style>
    </div>
  );
}