import { Trash2 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string;
}

interface UserManagementTableProps {
  users: AdminUser[];
  loadingUsers: boolean;
  currentUser: User | null;
  onRefreshUsers: () => void;
  onDeleteUser: (id: string) => void;
}

export default function UserManagementTable({
  users,
  loadingUsers,
  currentUser,
  onRefreshUsers,
  onDeleteUser
}: UserManagementTableProps) {
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mt-5 mb-3 px-1">
        <h6 className="fw-black text-muted text-uppercase tracking-widest mb-0">User Management</h6>
        <button className="btn btn-light rounded-pill px-3 py-1 shadow-sm fw-bold small d-flex align-items-center gap-1" onClick={onRefreshUsers} disabled={loadingUsers}>
          {loadingUsers ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden mb-5">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="xx-small fw-bold text-uppercase text-muted py-3 px-4">User</th>
                <th className="xx-small fw-bold text-uppercase text-muted py-3">Role & Status</th>
                <th className="xx-small fw-bold text-uppercase text-muted py-3">Joined</th>
                <th className="xx-small fw-bold text-uppercase text-muted py-3 text-end px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="fw-bold text-dark">{u.full_name || 'No Name'}</div>
                    <div className="small text-muted">{u.email}</div>
                  </td>
                  <td className="py-3">
                    <div className="d-flex flex-column gap-1 align-items-start">
                      <span className={`badge rounded-pill ${u.role === 'admin' ? 'bg-primary' : 'bg-secondary'}`}>
                        {u.role.toUpperCase()}
                      </span>
                      <span className={`badge rounded-pill ${
                        u.status === 'verified' ? 'bg-success' :
                        u.status === 'pending' ? 'bg-warning text-dark' : 'bg-danger'
                      }`}>
                        {u.status.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 small text-muted">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {currentUser?.id !== u.id && (
                      <button
                        className="btn btn-light rounded-circle p-2 text-danger"
                        onClick={() => onDeleteUser(u.id)}
                        title="Delete user completely"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loadingUsers && (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-muted small">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
