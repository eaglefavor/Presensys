import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft,
  CloudSync,
  CloudOff,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { realtimeSync } from '../lib/RealtimeSyncEngine';

const Layout: React.FC = () => {
  const activeSemester = useAppStore(state => state.activeSemester);
  const { profile, signOut, user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const initSync = async () => {
      if (!navigator.onLine || !user) {
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        return;
      }
      setSyncStatus('syncing');
      try {
        await realtimeSync.initialize(user.id);
        setSyncStatus('synced');
      } catch (e) {
        console.error(e);
        setSyncStatus('error');
      }
    };

    initSync();
    window.addEventListener('online', () => setSyncStatus('synced'));
    window.addEventListener('offline', () => setSyncStatus('offline'));

    return () => { };
  }, [user]);

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/students', label: 'Student' },
    { path: '/semesters', label: 'Semester' },
    { path: '/courses', label: 'Courses' },
    { path: '/attendance', label: 'Mark Attendance' },
    { path: '/archives', label: 'Data Archive' },
  ];

  const isRootPath = location.pathname === '/' || ['/students', '/semesters', '/courses', '/attendance', '/archives'].includes(location.pathname);

  const handleManualSync = async () => {
    if (!navigator.onLine || !user) {
        alert('Cannot sync: Device is offline.');
        return;
    }
    setSyncStatus('syncing');
    try {
        await realtimeSync.sync();
        setSyncStatus('synced');
    } catch (e) {
        console.error(e);
        setSyncStatus('error');
    }
  };

  return (
    <div className="app-container">
      <header className="app-header bg-white border-bottom sticky-top shadow-sm">
        <div className="container-mobile d-flex align-items-center justify-content-between px-3 h-100">
          <div className="d-flex align-items-center gap-2">
            {!isRootPath ? (
              <button className="btn btn-link text-dark p-0 me-2" onClick={() => navigate(-1)}><ChevronLeft size={24} /></button>
            ) : (
              <button className="btn btn-link text-primary p-0 me-2" onClick={() => setIsMenuOpen(true)}><Menu size={26} /></button>
            )}
            <h1 className="h5 mb-0 fw-black text-primary letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>PRESENSYS</h1>
          </div>
          
          <div className="d-flex align-items-center gap-3">
            <div className="sync-indicator" onClick={handleManualSync} style={{ cursor: 'pointer' }}>
              {syncStatus === 'syncing' && <RefreshCw size={18} className="text-primary spin" />}
              {syncStatus === 'synced' && <CloudSync size={18} style={{ color: 'var(--primary-blue)' }} />}
              {syncStatus === 'offline' && <CloudOff size={18} className="text-muted" />}
              {syncStatus === 'error' && <CloudOff size={18} className="text-danger" />}
            </div>
            {activeSemester && (
              <Link to="/semesters" className="text-decoration-none">
                <span className="badge rounded-pill bg-light text-primary border px-2 py-2 fw-bold xx-small" style={{ color: 'var(--primary-blue)', borderColor: 'var(--border-color)' }}>
                  {activeSemester.name.split(' ')[0]}
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar Drawer */}
      <div className={`menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)}></div>
      <aside className={`side-menu bg-white shadow-2xl ${isMenuOpen ? 'open' : ''}`}>
        <div className="d-flex flex-column h-100">
          <div className="p-4 bg-white border-bottom d-flex justify-content-between align-items-start">
            <div>
              <h5 className="fw-black mb-0 text-primary uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>PRESENSYS</h5>
              <p className="xx-small fw-bold text-muted opacity-75 mb-0">Portal Management</p>
            </div>
            <button className="btn btn-light rounded-circle p-1" onClick={() => setIsMenuOpen(false)}><X size={20} /></button>
          </div>

          <div className="px-4 py-3 border-bottom bg-light d-flex align-items-center gap-3">
            <div className="avatar-small bg-primary text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px', borderRadius: '10px' }}>
              {profile?.full_name?.[0] || 'U'}
            </div>
            <div className="overflow-hidden">
              <div className="fw-bold small text-dark text-truncate">{profile?.full_name || 'User'}</div>
              <div className="xx-small text-muted text-uppercase fw-bold">{profile?.role} ACCOUNT</div>
            </div>
          </div>

          <nav className="flex-grow-1 p-3">
            <div className="d-flex flex-column gap-1">
              {navItems.map((item) => (
                <Link key={item.path} to={item.path} onClick={() => setIsMenuOpen(false)} className={`nav-item-premium ${location.pathname === item.path ? 'active' : ''}`}>
                  <span className="fw-bold small">{item.label}</span>
                  <ChevronRight size={14} className="arrow-icon" />
                </Link>
              ))}
            </div>
          </nav>

          <div className="p-3 mt-auto border-top bg-light">
            {profile?.role === 'admin' && (
              <Link to="/admin" className="btn btn-outline-primary w-100 mb-2 py-2 rounded-3 fw-bold small d-flex align-items-center justify-content-center gap-2" onClick={() => setIsMenuOpen(false)}><ShieldCheck size={18} /> Admin Console</Link>
            )}
            <button className="btn btn-link text-danger w-100 text-decoration-none fw-bold small d-flex align-items-center justify-content-center gap-2" onClick={() => { signOut(); setIsMenuOpen(false); }}><LogOut size={18} /> Sign Out</button>
          </div>
        </div>
      </aside>

      <main className="app-content flex-grow-1 overflow-auto">
        <div className="container-mobile">
          <Outlet />
        </div>
      </main>

      <style>{`
        .menu-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(2px);
          z-index: 2000; opacity: 0; pointer-events: none;
          transition: opacity 0.3s ease;
        }
        .menu-overlay.open { opacity: 1; pointer-events: auto; }

        .side-menu {
          position: fixed; top: 0; left: -280px; width: 280px; height: 100%;
          z-index: 2001; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border-top-right-radius: 20px; border-bottom-right-radius: 20px;
          will-change: transform;
        }
        .side-menu.open { transform: translateX(280px); }

        .nav-item-premium {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; border-radius: 10px; text-decoration: none;
          color: var(--text-muted); transition: background 0.2s;
        }
        .nav-item-premium.active { background: rgba(0, 105, 148, 0.08); color: var(--primary-blue); }
        .nav-item-premium .arrow-icon { opacity: 0; transition: opacity 0.2s; }
        .nav-item-premium.active .arrow-icon { opacity: 1; }

        .spin { animation: rotation 2s infinite linear; }
        @keyframes rotation { from { transform: rotate(0deg); } to { transform: rotate(359deg); } }

        @media (min-width: 501px) {
          .side-menu, .menu-overlay { position: absolute; }
        }
      `}</style>
    </div>
  );
};

export default Layout;