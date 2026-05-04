import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { Lock, Eye, EyeOff, ChevronRight, ShieldCheck, User, KeyRound, GraduationCap, Building, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { FACULTIES, LEVELS, getDepartments } from '../lib/unizikData';

export default function Settings() {
  const { user, profile } = useAuthStore();
  const isGoogleUser = user?.app_metadata?.provider === 'google' || user?.app_metadata?.providers?.includes('google');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Academic info state
  const [faculty, setFaculty] = useState(profile?.faculty || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [level, setLevel] = useState(profile?.level || '');
  const [savingAcademic, setSavingAcademic] = useState(false);

  // Sync from profile when it loads
  useEffect(() => {
    if (profile) {
      setFaculty(profile.faculty || '');
      setDepartment(profile.department || '');
      setLevel(profile.level || '');
    }
  }, [profile]);

  // Reset department when faculty changes
  const handleFacultyChange = (newFaculty: string) => {
    setFaculty(newFaculty);
    setDepartment(''); // Reset department since it depends on faculty
  };

  const handleSaveAcademic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSavingAcademic(true);
    const { error } = await supabase
      .from('profiles')
      .update({ faculty, department, level })
      .eq('id', user.id);

    setSavingAcademic(false);

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      // Update local cache
      const updatedProfile = { ...profile, faculty, department, level };
      localStorage.setItem('user_profile', JSON.stringify(updatedProfile));
      useAuthStore.setState({ profile: updatedProfile as any });
      toast.success('Academic info saved!');
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isGoogleUser ? 'Password set! You can now sign in with email + password.' : 'Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const availableDepartments = faculty ? getDepartments(faculty) : [];

  return (
    <div className="settings-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm sticky-top" style={{ zIndex: 100 }}>
        <h1 className="h4 fw-black mb-1 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>SETTINGS</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Account Management</p>
      </div>

      <div className="px-4 container-mobile">
        {/* Profile Info Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4 border-left-blue">
            <div className="d-flex align-items-center gap-3 mb-3">
              <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3 d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px', borderRadius: '16px' }}>
                <User size={28} />
              </div>
              <div className="flex-grow-1 overflow-hidden">
                <h5 className="fw-black text-dark text-uppercase mb-0 letter-spacing-n1">{profile?.full_name || 'User'}</h5>
                <p className="xx-small fw-black text-muted tracking-widest mb-0 text-uppercase">{user?.email}</p>
              </div>
            </div>
            <div className="row g-2">
              <div className="col-4">
                <div className="bg-light p-3 rounded-3 border">
                  <div className="xx-small fw-bold text-muted uppercase mb-1">Role</div>
                  <div className="small fw-black text-dark text-uppercase">{profile?.role || 'rep'}</div>
                </div>
              </div>
              <div className="col-4">
                <div className="bg-light p-3 rounded-3 border">
                  <div className="xx-small fw-bold text-muted uppercase mb-1">Auth</div>
                  <div className="small fw-black text-dark text-uppercase">{isGoogleUser ? 'Google' : 'Email'}</div>
                </div>
              </div>
              <div className="col-4">
                <div className="bg-light p-3 rounded-3 border">
                  <div className="xx-small fw-bold text-muted uppercase mb-1">Level</div>
                  <div className="small fw-black text-dark text-uppercase">{profile?.level?.replace(' Level', 'L') || '—'}</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Academic Info Section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="d-flex align-items-center gap-2 mb-3 px-1">
            <GraduationCap size={14} className="text-muted" />
            <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">Academic Information</h6>
          </div>

          <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4">
            <form onSubmit={handleSaveAcademic}>
              <div className="mb-3">
                <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">
                  <Building size={10} className="me-1" /> Faculty
                </label>
                <select
                  className="form-select rounded-3 fw-bold border-light bg-light py-2"
                  value={faculty}
                  onChange={e => handleFacultyChange(e.target.value)}
                >
                  <option value="">Select Faculty...</option>
                  {FACULTIES.map(f => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">
                  <Layers size={10} className="me-1" /> Department
                </label>
                <select
                  className="form-select rounded-3 fw-bold border-light bg-light py-2"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  disabled={!faculty}
                >
                  <option value="">{faculty ? 'Select Department...' : 'Select a Faculty first'}</option>
                  {availableDepartments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">
                  <GraduationCap size={10} className="me-1" /> Level
                </label>
                <select
                  className="form-select rounded-3 fw-bold border-light bg-light py-2"
                  value={level}
                  onChange={e => setLevel(e.target.value)}
                >
                  <option value="">Select Level...</option>
                  {LEVELS.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <button className="btn btn-primary w-100 py-3 rounded-pill fw-black shadow-lg d-flex align-items-center justify-content-center gap-2 text-uppercase letter-spacing-n1" disabled={savingAcademic}>
                {savingAcademic ? (
                  <div className="spinner-border spinner-border-sm" role="status"></div>
                ) : (
                  <>Save Academic Info <ChevronRight size={18} /></>
                )}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Password Section */}
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
      </div>
    </div>
  );
}
