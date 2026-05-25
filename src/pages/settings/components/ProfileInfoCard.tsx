import { User } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProfileInfoCardProps {
  profile: Record<string, unknown> | null;
  user: Record<string, unknown> | null;
  isGoogleUser: boolean;
}

export function ProfileInfoCard({ profile, user, isGoogleUser }: ProfileInfoCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <div className="card border-0 shadow-sm p-4 rounded-4 mb-4 border-left-blue" style={{ backgroundColor: 'var(--soft-white)', color: 'var(--text-dark)' }}>
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="text-primary p-3 rounded-3 d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: 'var(--primary-highlight-bg)' }}>
            <User size={28} />
          </div>
          <div className="flex-grow-1 overflow-hidden">
            <h5 className="fw-black text-uppercase mb-0 letter-spacing-n1" style={{ color: 'var(--text-dark)' }}>{String(profile?.full_name || 'User')}</h5>
            <p className="xx-small fw-black tracking-widest mb-0 text-uppercase" style={{ color: 'var(--text-muted)' }}>{String(user?.email || '')}</p>
          </div>
        </div>
        <div className="row g-2">
          <div className="col-4">
            <div className="p-3 rounded-3 border" style={{ backgroundColor: 'var(--bg-gray)', borderColor: 'var(--border-color)' }}>
              <div className="xx-small fw-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Role</div>
              <div className="small fw-black text-uppercase" style={{ color: 'var(--text-dark)' }}>{String(profile?.role || 'rep')}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="p-3 rounded-3 border" style={{ backgroundColor: 'var(--bg-gray)', borderColor: 'var(--border-color)' }}>
              <div className="xx-small fw-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Auth</div>
              <div className="small fw-black text-uppercase" style={{ color: 'var(--text-dark)' }}>{isGoogleUser ? 'Google' : 'Email'}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="p-3 rounded-3 border" style={{ backgroundColor: 'var(--bg-gray)', borderColor: 'var(--border-color)' }}>
              <div className="xx-small fw-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Level</div>
              <div className="small fw-black text-uppercase" style={{ color: 'var(--text-dark)' }}>{String(profile?.level || '').replace(' Level', 'L') || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
