import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  CheckSquare, 
  Archive, 
  ChevronLeft,
  CloudSync,
  CloudOff,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  ChevronRight,
  CalendarDays
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { syncEngine } from '../lib/syncEngine';

const Layout: React.FC = () => {
  const activeSemester = useAppStore(state => state.activeSemester);
  const { profile, signOut, user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const performSync = async () => {
      if (!navigator.onLine || !user) {
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        return;
      }
      setSyncStatus('syncing');
      const result = await syncEngine.syncAll();
      if (result.success) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    };

    performSync();
    window.addEventListener('online', performSync);
    window.addEventListener('offline', () => setSyncStatus('offline'));
    const interval = setInterval(performSync, 30000);

    return () => {
      window.removeEventListener('online', performSync);
      window.removeEventListener('offline', () => setSyncStatus('offline'));
      clearInterval(interval);
    };
  }, [user]);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/students', label: 'Students', icon: Users },
    { path: '/semesters', label: 'Semester', icon: CalendarDays },
    { path: '/courses', label: 'Courses', icon: BookOpen },
    { path: '/attendance', label: 'Mark Attendance', icon: CheckSquare },
    { path: '/archives', label: 'Data Archives', icon: Archive },
  ];

  const isRootPath = location.pathname === '/' || navItems.some(item => item.path === location.pathname);

  const handleManualSync = async () => {
    if (!navigator.onLine || !user) {
        alert('Cannot sync: Device is offline.');
        return;
    }
    if (confirm('Force download data from cloud? This may fix missing items.')) {
        setSyncStatus('syncing');
        await syncEngine.pullFromCloud(user.id); // Force pull specifically
        const result = await syncEngine.syncAll();
        if (result.success) setSyncStatus('synced');
        else setSyncStatus('error');
        window.location.reload(); // Refresh to show new data
    }
  };

  return (
    <div className="app-container">
      <header className="app-header bg-white border-bottom sticky-top shadow-sm">
        <div className="container-mobile d-flex align-items-center justify-content-between px-3 h-100">
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-link text-primary p-0 me-1" onClick={() => setIsMenuOpen(true)}><Menu size={26} /></button>
            {!isRootPath && <button className="btn btn-link text-dark p-0" onClick={() => navigate(-1)}><ChevronLeft size={24} /></button>}
            <h1 className="h6 mb-0 fw-black text-primary letter-spacing-n1" style={{ color: 'var(--primary-blue) !important' }}>PRESENSYS</h1>
          </div>
          
          <div className="d-flex align-items-center gap-2">
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

      {/* Optimized Sidebar (CSS Transitions) */}
      <div className={`menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)}></div>
      <aside className={`side-menu bg-white shadow-2xl ${isMenuOpen ? 'open' : ''}`}>
        <div className="d-flex flex-column h-100">
          <div className="p-4 bg-white border-bottom d-flex justify-content-between align-items-start">
            <div>
              <h5 className="fw-black mb-0 text-primary uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>PRESENSYS</h5>
              <p className="xx-small fw-bold text-muted opacity-75 mb-0">Management Portal</p>
            </div>
            <button className="btn btn-light rounded-circle p-1" onClick={() => setIsMenuOpen(false)}><X size={20} /></button>
          </div>

          <div className="px-4 py-3 border-bottom bg-light d-flex align-items-center gap-3">
            <div className="avatar-small bg-primary text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px', borderRadius: '10px' }}>
              {profile?.full_name?.[0] || 'U'}
            </div>
            <div className="overflow-hidden">
              <div className="fw-bold small text-dark text-truncate">{profile?.full_name || 'User'}</div>
              <div className="xx-small text-muted text-uppercase fw-bold">{profile?.role} Account</div>
            </div>
          </div>

          <nav className="flex-grow-1 p-3">
            <div className="d-flex flex-column gap-1">
              {navItems.map((item) => (
                <Link key={item.path} to={item.path} onClick={() => setIsMenuOpen(false)} className={`nav-item-premium ${location.pathname === item.path ? 'active' : ''}`}>
                  <div className="d-flex align-items-center gap-3">
                    <item.icon size={20} className="nav-icon" />
                    <span className="fw-bold small">{item.label}</span>
                  </div>
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

      <main className="app-content">
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