import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';
import { ProfileInfoCard } from './settings/components/ProfileInfoCard';
import { AcademicInfoSection } from './settings/components/AcademicInfoSection';
import { PasswordSection } from './settings/components/PasswordSection';

export default function Settings() {
  const { user, profile } = useAuthStore();
  const app_metadata = user?.app_metadata as Record<string, unknown> | undefined;
  const isGoogleUser = app_metadata?.provider === 'google' ||
    (Array.isArray(app_metadata?.providers) && app_metadata?.providers.includes('google'));

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
      if (profile.faculty && profile.faculty !== faculty) setTimeout(() => setFaculty(profile.faculty || ''), 0);
      if (profile.department && profile.department !== department) setTimeout(() => setDepartment(profile.department || ''), 0);
      if (profile.level && profile.level !== level) setTimeout(() => setLevel(profile.level || ''), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      useAuthStore.setState({ profile: updatedProfile as unknown as typeof profile });
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

  return (
    <div className="settings-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm sticky-top" style={{ zIndex: 100 }}>
        <h1 className="h4 fw-black mb-1 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>SETTINGS</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Account Management</p>
      </div>

      <div className="px-4 container-mobile">
        <ProfileInfoCard
          profile={profile as unknown as Record<string, unknown>}
          user={user as unknown as Record<string, unknown>}
          isGoogleUser={isGoogleUser}
        />

        <AcademicInfoSection
          faculty={faculty}
          department={department}
          level={level}
          savingAcademic={savingAcademic}
          handleFacultyChange={handleFacultyChange}
          setDepartment={setDepartment}
          setLevel={setLevel}
          handleSaveAcademic={handleSaveAcademic}
        />

        <PasswordSection
          isGoogleUser={isGoogleUser}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          loading={loading}
          handlePasswordUpdate={handlePasswordUpdate}
        />
      </div>
    </div>
  );
}
