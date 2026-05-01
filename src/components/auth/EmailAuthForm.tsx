import React from 'react';
import { Mail, Lock, User, ChevronRight, Info } from 'lucide-react';

interface EmailAuthFormProps {
  isLogin: boolean;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  fullName: string;
  setFullName: (name: string) => void;
  error: string | null;
  loading: boolean;
  handleAuth: (e: React.FormEvent) => Promise<void>;
  setShowForgotPassword: (show: boolean) => void;
}

export default function EmailAuthForm({
  isLogin,
  email,
  setEmail,
  password,
  setPassword,
  fullName,
  setFullName,
  error,
  loading,
  handleAuth,
  setShowForgotPassword
}: EmailAuthFormProps) {
  return (
    <form onSubmit={handleAuth}>
      {error && (
        <div className="alert alert-danger border-0 rounded-3 small py-2 mb-3 d-flex align-items-center gap-2">
          <div className="bg-danger rounded-circle p-1" style={{width: '6px', height: '6px'}}></div>
          {error}
        </div>
      )}

      {!isLogin && (
        <div className="mb-3">
          <label className="form-label x-small fw-bold text-uppercase text-muted ps-1 mb-1">Full Name</label>
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
        <label className="form-label x-small fw-bold text-uppercase text-muted ps-1 mb-1">University Email</label>
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

      <div className="mb-3">
        <label className="form-label x-small fw-bold text-uppercase text-muted ps-1 mb-1">Password</label>
        <div className="input-group modern-input-unified">
          <span className="input-group-text"><Lock size={18} /></span>
          <input
            type="password"
            className="form-control"
            placeholder="••••••••"
            required
            minLength={isLogin ? undefined : 8}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
      </div>

      {isLogin && (
        <div className="text-end mb-3">
          <button
            type="button"
            className="btn btn-link text-muted xx-small fw-bold p-0 text-decoration-none"
            onClick={() => setShowForgotPassword(true)}
          >
            Forgot password?
          </button>
        </div>
      )}

      {!isLogin && (
        <div className="bg-light p-3 rounded-4 mb-4 d-flex gap-3 align-items-start border border-light">
          <Info size={18} className="text-primary mt-1 flex-shrink-0" />
          <p className="xx-small text-muted mb-0 fw-bold">
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
  );
}
