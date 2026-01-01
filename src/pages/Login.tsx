import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, Mail, Lock, Chrome } from 'lucide-react';
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
    <div className="animate-in p-3 d-flex flex-column justify-content-center min-vh-100 pb-5">
      <div className="text-center mb-5">
        <div className="bg-primary text-white d-inline-block p-3 rounded-4 shadow-lg mb-3">
          <LogIn size={40} />
        </div>
        <h2 className="fw-bold">Welcome to Presensys</h2>
        <p className="text-muted">Sign in to manage UNIZIK attendance</p>
      </div>

      <div className="card border-0 shadow-lg rounded-4 overflow-hidden mb-4">
        <div className="card-body p-4">
          <form onSubmit={handleLogin}>
            {error && <div className="alert alert-danger small py-2">{error}</div>}
            
            <div className="mb-3">
              <label className="form-label small fw-bold">University Email</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-0"><Mail size={18} className="text-muted" /></span>
                <input 
                  type="email" 
                  className="form-control border-0 bg-light" 
                  placeholder="name@email.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label small fw-bold">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-0"><Lock size={18} className="text-muted" /></span>
                <input 
                  type="password" 
                  className="form-control border-0 bg-light" 
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button className="btn btn-primary w-100 py-3 rounded-3 shadow mb-3" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center my-3 position-relative">
            <hr />
            <span className="position-absolute top-50 start-50 translate-middle bg-white px-3 small text-muted">OR</span>
          </div>

          <button 
            className="btn btn-outline-dark w-100 py-2 rounded-3 d-flex align-items-center justify-content-center gap-2 mb-2"
            onClick={handleGoogleLogin}
          >
            <Chrome size={20} /> Continue with Google
          </button>
        </div>
      </div>

      <div className="text-center">
        <p className="text-muted small">
          Don't have an account? <Link to="/signup" className="text-primary fw-bold text-decoration-none">Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
