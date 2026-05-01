import React from 'react';
import { Mail, ChevronRight, ArrowLeft } from 'lucide-react';

interface ForgotPasswordFormProps {
  email: string;
  setEmail: (email: string) => void;
  handleForgotPassword: (e: React.FormEvent) => Promise<void>;
  setShowForgotPassword: (show: boolean) => void;
  loading: boolean;
}

export default function ForgotPasswordForm({
  email,
  setEmail,
  handleForgotPassword,
  setShowForgotPassword,
  loading
}: ForgotPasswordFormProps) {
  return (
    <div>
      <button
        type="button"
        className="btn btn-link text-muted fw-bold xx-small p-0 mb-3 d-flex align-items-center gap-1 text-decoration-none"
        onClick={() => setShowForgotPassword(false)}
      >
        <ArrowLeft size={14} /> Back to sign in
      </button>
      <h5 className="fw-black text-dark mb-1 letter-spacing-n1">RESET PASSWORD</h5>
      <p className="xx-small fw-bold text-muted text-uppercase tracking-widest mb-4">
        We'll send a reset link to your email
      </p>
      <form onSubmit={handleForgotPassword}>
        <div className="mb-4">
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

        <button className="btn btn-primary-unified w-100 py-3 rounded-4 fw-bold shadow-lg d-flex align-items-center justify-content-center gap-2" disabled={loading}>
          {loading ? <div className="spinner-border spinner-border-sm" role="status" /> : <>Send Reset Link <ChevronRight size={18} /></>}
        </button>
      </form>
    </div>
  );
}
