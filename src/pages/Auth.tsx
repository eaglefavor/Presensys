import { useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import AuthStyles from '../components/auth/AuthStyles';
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm';
import EmailAuthForm from '../components/auth/EmailAuthForm';
import GoogleAuthButton from '../components/auth/GoogleAuthButton';

export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  // Derive isLogin directly from location.pathname, no need for useState+useEffect to sync it
  const isLogin = location.pathname !== '/signup';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isLogin && password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

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
        toast.success('Verification email sent! Check your inbox.');
        navigate('/login');
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Enter your email address above first.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password reset email sent! Check your inbox.');
      setShowForgotPassword(false);
    }
  };

  return (
    <div className="auth-page animate-in">
      <div className="auth-hero text-center py-5 px-4 text-white shadow-lg mb-4">
        <div className="brand-icon-wrapper mb-3 mx-auto shadow-sm">
          <ShieldCheck size={42} className="text-warning" />
        </div>
        <h1 className="fw-black mb-1 letter-spacing-n1 h2 text-uppercase">PRESENSYS</h1>
        <p className="opacity-75 x-small fw-bold text-uppercase tracking-widest mb-0">UNIZIK Digital Attendance</p>
      </div>

      <div className="px-3 pb-5 container-mobile">
        {/* Mode Switcher Dial */}
        <div className="mode-switcher-wrapper mb-4 p-1 shadow-sm border">
          <button 
            className={`mode-btn ${isLogin ? 'active' : ''}`}
            onClick={() => navigate('/login')}
          >
            Sign In
          </button>
          <button 
            className={`mode-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => navigate('/signup')}
          >
            Register
          </button>
        </div>

        <div className="auth-card card border-0 shadow-xl rounded-5 overflow-hidden mb-4">
          <div className="card-body p-4">

            {showForgotPassword ? (
              <ForgotPasswordForm
                email={email}
                setEmail={setEmail}
                handleForgotPassword={handleForgotPassword}
                setShowForgotPassword={setShowForgotPassword}
                loading={loading}
              />
            ) : (
              <>
                <GoogleAuthButton handleGoogleLogin={handleGoogleLogin} />

                <div className="separator mb-4">
                  <span className="separator-text px-3 text-uppercase">or email access</span>
                </div>

                <EmailAuthForm
                  isLogin={isLogin}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  fullName={fullName}
                  setFullName={setFullName}
                  error={error}
                  loading={loading}
                  handleAuth={handleAuth}
                  setShowForgotPassword={setShowForgotPassword}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <AuthStyles />
    </div>
  );
}
