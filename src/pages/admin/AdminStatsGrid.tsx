import { Users, ShieldCheck, Activity } from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  activeReps: number;
  pendingUsers: number;
}

interface AdminStatsGridProps {
  stats: AdminStats;
}

export default function AdminStatsGrid({ stats }: AdminStatsGridProps) {
  return (
    <div className="row g-3 mb-4">
      <div className="col-12">
        <div className="card border-0 bg-primary text-white p-4 rounded-4 shadow-lg position-relative overflow-hidden">
          <div className="position-absolute top-0 end-0 p-3 opacity-10"><Users size={100} /></div>
          <div className="position-relative z-10">
            <div className="xx-small fw-bold text-uppercase tracking-widest mb-1 opacity-75">Total Users</div>
            <h1 className="display-4 fw-black mb-0 letter-spacing-n1">{stats.totalUsers}</h1>
            <div className="d-flex gap-3 mt-3">
              <div className="d-flex align-items-center gap-1 small"><ShieldCheck size={16} /> <strong>{stats.activeReps}</strong> Active</div>
              <div className="d-flex align-items-center gap-1 small text-warning"><Activity size={16} /> <strong>{stats.pendingUsers}</strong> Pending</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
