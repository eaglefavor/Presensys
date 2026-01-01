import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Mail, Lock, User, ShieldCheck } from 'lucide-react';
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

    // Domain validation
    if (!email.endsWith('@stu.unizik.edu.ng')) {
      setError('Only UNIZIK student emails (@stu.unizik.edu.ng) are allowed.');
      setLoading(false);
      return;
    }

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
    <div className="animate-in p-3 d-flex flex-column justify-content-center min-vh-100 pb-5">
      <div className="text-center mb-4">
        <div className="bg-success text-white d-inline-block p-3 rounded-4 shadow-lg mb-3">
          <UserPlus size={40} />
        </div>
        <h2 className="fw-bold">Create Account</h2>
        <p className="text-muted">Register as a Course Representative</p>
      </div>

      <div className="card border-0 shadow-lg rounded-4 overflow-hidden mb-4">
        <div className="card-body p-4">
          <form onSubmit={handleSignup}>
            {error && <div className="alert alert-danger small py-2">{error}</div>}
            
            <div className="mb-3">
              <label className="form-label small fw-bold">Full Name</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-0"><User size={18} className="text-muted" /></span>
                <input 
                  type="text" 
                  className="form-control border-0 bg-light" 
                  placeholder="John Doe"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-bold">University Email</label>
              <div className="input-group">
                <span className="input-group-text bg-light border-0"><Mail size={18} className="text-muted" /></span>
                <input 
                  type="email" 
                  className="form-control border-0 bg-light" 
                  placeholder="name@stu.unizik.edu.ng"
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
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-light p-3 rounded-3 mb-4 d-flex gap-3 align-items-center">
              <ShieldCheck size={24} className="text-primary flex-shrink-0" />
              <p className="small text-muted mb-0">After signing up, you will need an <strong>Access Code</strong> from the Admin to activate your account.</p>
            </div>

            <button className="btn btn-success w-100 py-3 rounded-3 shadow" disabled={loading}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
        </div>
      </div>

      <div className="text-center">
        <p className="text-muted small">
          Already have an account? <Link to="/login" className="text-primary fw-bold text-decoration-none">Log In</Link>
        </p>
      </div>
    </div>
  );
}
