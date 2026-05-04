import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuthStore } from '../store/useAuthStore';

// Subcomponents
import AdminStatsGrid from './admin/AdminStatsGrid';
import AccessCodeManager from './admin/AccessCodeManager';
import UserManagementTable from './admin/UserManagementTable';

interface AdminStats {
  totalUsers: number;
  activeReps: number;
  pendingUsers: number;
}

interface AccessCode {
  id: number;
  code: string;
  is_used: boolean;
  created_at: string;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string;
}

export default function Admin() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, activeReps: 0, pendingUsers: 0 });
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmDeleteCodeId, setConfirmDeleteCodeId] = useState<number | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    fetchCodes();
    fetchStats();
    fetchUsers();
  }, []);

  async function fetchCodes() {
    const { data, error } = await supabase
      .from('access_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setCodes(data);
    }
  };

  async function fetchStats() {
    const { data, error } = await supabase.rpc('get_admin_stats');
    if (!error && data) {
      setStats({
        totalUsers: data.total_users,
        activeReps: data.active_reps,
        pendingUsers: data.pending_users
      });
    }
  };

  async function generateCode() {
    setLoading(true);
    // Use crypto.getRandomValues for a cryptographically secure random code.
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const newCode = Array.from(bytes)
      .map(b => b.toString(36).toUpperCase())
      .join('')
      .substring(0, 6);
    const { error } = await supabase.from('access_codes').insert({ code: newCode });
    if (error) {
      toast.error('Failed to generate code: ' + error.message);
    } else {
      await fetchCodes();
    }
    setLoading(false);
  };

  async function fetchUsers() {
    setLoadingUsers(true);
    const { data, error } = await supabase.rpc('get_admin_users');
    if (error) {
      toast.error('Failed to load users.');
    } else if (data) {
      setUsers(data as AdminUser[]);
    }
    setLoadingUsers(false);
  };

  async function deleteUser(id: string) {
    const { data, error } = await supabase.rpc('delete_user', { target_user_id: id });
    if (error) {
      toast.error('Failed to delete user: ' + error.message);
      return;
    }

    if (data && !data.success) {
      toast.error(data.message || 'Failed to delete user.');
      return;
    }

    toast.success('User completely deleted.');
    await fetchUsers();
    await fetchStats();
  };

  async function deleteCode(id: number) {
    const { error } = await supabase.from('access_codes').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete code.');
      return;
    }
    await fetchCodes();
  };

  function copyToClipboard(code: string, id: number) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="admin-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      {/* Header */}
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <h1 className="h4 fw-black mb-0 text-primary" style={{ color: 'var(--primary-blue)' }}>ADMIN CONSOLE</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">System Overview</p>
      </div>

      <div className="px-4 container-mobile">
        <AdminStatsGrid stats={stats} />

        <AccessCodeManager
          codes={codes}
          loading={loading}
          copiedId={copiedId}
          onGenerateCode={generateCode}
          onCopyCode={copyToClipboard}
          onDeleteCode={setConfirmDeleteCodeId}
        />

        <UserManagementTable
          users={users}
          loadingUsers={loadingUsers}
          currentUser={currentUser}
          onRefreshUsers={fetchUsers}
          onDeleteUser={setConfirmDeleteUserId}
        />
      </div>

      <ConfirmDialog
        open={confirmDeleteCodeId !== null}
        title="Delete Access Code"
        message="Delete this access code? Any rep who has not yet used it will be unable to verify."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (confirmDeleteCodeId !== null) deleteCode(confirmDeleteCodeId); setConfirmDeleteCodeId(null); }}
        onCancel={() => setConfirmDeleteCodeId(null)}
      />

      <ConfirmDialog
        open={confirmDeleteUserId !== null}
        title="Wipe User Data"
        message="Are you absolutely sure? This will permanently delete the user's account and ALL associated data (semesters, courses, students, attendance). This action cannot be undone."
        confirmLabel="Wipe Account"
        variant="danger"
        onConfirm={() => { if (confirmDeleteUserId !== null) deleteUser(confirmDeleteUserId); setConfirmDeleteUserId(null); }}
        onCancel={() => setConfirmDeleteUserId(null)}
      />
    </div>
  );
}
