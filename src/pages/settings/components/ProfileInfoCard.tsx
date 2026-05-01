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
      <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-4 border-left-blue">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-3 d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px', borderRadius: '16px' }}>
            <User size={28} />
          </div>
          <div className="flex-grow-1 overflow-hidden">
            <h5 className="fw-black text-dark text-uppercase mb-0 letter-spacing-n1">{String(profile?.full_name || 'User')}</h5>
            <p className="xx-small fw-black text-muted tracking-widest mb-0 text-uppercase">{String(user?.email || '')}</p>
          </div>
        </div>
        <div className="row g-2">
          <div className="col-4">
            <div className="bg-light p-3 rounded-3 border">
              <div className="xx-small fw-bold text-muted uppercase mb-1">Role</div>
              <div className="small fw-black text-dark text-uppercase">{String(profile?.role || 'rep')}</div>
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
              <div className="small fw-black text-dark text-uppercase">{String(profile?.level || '').replace(' Level', 'L') || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
