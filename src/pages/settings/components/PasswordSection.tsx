import { KeyRound, ShieldCheck, Lock, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface PasswordSectionProps {
  isGoogleUser: boolean;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  newPassword: string;
  setNewPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (password: string) => void;
  loading: boolean;
  handlePasswordUpdate: (e: React.FormEvent) => void;
}

export function PasswordSection({
  isGoogleUser,
  showPassword,
  setShowPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  loading,
  handlePasswordUpdate
}: PasswordSectionProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <div className="d-flex align-items-center gap-2 mb-3 px-1">
        <KeyRound size={14} className="text-muted" />
        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">
          {isGoogleUser ? 'Set a Password' : 'Change Password'}
        </h6>
      </div>

      {isGoogleUser && (
        <div className="bg-light p-3 rounded-4 mb-3 d-flex gap-3 align-items-start border border-light">
          <ShieldCheck size={18} className="text-primary mt-1 flex-shrink-0" />
          <p className="xx-small text-muted mb-0 fw-bold">
            You signed up with <strong>Google</strong>. Set a password below to also enable <strong>email + password</strong> sign-in.
          </p>
        </div>
      )}

      <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4">
        <form onSubmit={handlePasswordUpdate}>
          <div className="mb-3">
            <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">New Password</label>
            <div className="modern-input-unified d-flex align-items-center">
              <span className="input-group-text bg-transparent border-0 ps-3"><Lock size={18} className="text-muted" /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control border-0 bg-transparent py-3 fw-bold"
                placeholder="Min. 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <button type="button" className="btn bg-transparent border-0 pe-3" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={18} className="text-muted" /> : <Eye size={18} className="text-muted" />}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">Confirm Password</label>
            <div className="modern-input-unified d-flex align-items-center">
              <span className="input-group-text bg-transparent border-0 ps-3"><Lock size={18} className="text-muted" /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control border-0 bg-transparent py-3 fw-bold"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          </div>

          <button className="btn btn-primary w-100 py-3 rounded-pill fw-black shadow-lg d-flex align-items-center justify-content-center gap-2 text-uppercase letter-spacing-n1" disabled={loading}>
            {loading ? (
              <div className="spinner-border spinner-border-sm" role="status"></div>
            ) : (
              <>{isGoogleUser ? 'Set Password' : 'Update Password'} <ChevronRight size={18} /></>
            )}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
