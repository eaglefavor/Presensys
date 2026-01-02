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
import { motion, AnimatePresence } from 'framer-motion';

const Layout: React.FC = () => {
  const activeSemester = useAppStore(state => state.activeSemester);
  const { profile, signOut } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const performSync = async () => {
      if (!navigator.onLine) {
        setSyncStatus('offline');
        return;
      }
      setSyncStatus('syncing');
      const result = await syncEngine.syncAll();
      if (result.success) {
        setSyncStatus('synced');
      } else if (result.message === 'Offline') {
        setSyncStatus('offline');
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
  }, []);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/students', label: 'Students', icon: Users },
    { path: '/semesters', label: 'Semester', icon: CalendarDays },
    { path: '/courses', label: 'Courses', icon: BookOpen },
    { path: '/attendance', label: 'Mark Attendance', icon: CheckSquare },
    { path: '/archives', label: 'Data Archives', icon: Archive },
  ];

  const isRootPath = location.pathname === '/' || navItems.some(item => item.path === location.pathname);

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <header className="app-header bg-white border-bottom sticky-top">
        <div className="container-mobile d-flex align-items-center justify-content-between px-3 h-100">
          <div className="d-flex align-items-center gap-2">
            <button 
              className="btn btn-link text-primary p-0 me-1" 
              onClick={() => setIsMenuOpen(true)}
            >
              <Menu size={26} />
            </button>
            
            {!isRootPath && (
              <button className="btn btn-link text-dark p-0" onClick={() => navigate(-1)}>
                <ChevronLeft size={24} />
              </button>
            )}
            
            <h1 className="h6 mb-0 fw-black text-primary letter-spacing-n1">PRESENSYS</h1>
          </div>
          
          <div className="d-flex align-items-center gap-2">
            <div className="sync-indicator me-1">
              {syncStatus === 'syncing' && <RefreshCw size={18} className="text-primary spin" />}
              {syncStatus === 'synced' && <CloudSync size={18} className="text-success" />}
              {syncStatus === 'offline' && <CloudOff size={18} className="text-muted" />}
              {syncStatus === 'error' && <CloudOff size={18} className="text-danger" />}
            </div>

            <div className="active-sem-pill">
              {activeSemester ? (
                <Link to="/semesters" className="text-decoration-none">
                  <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 fw-bold xx-small">
                    {activeSemester.name.split(' ')[0]}
                  </span>
                </Link>
              ) : (
                <Link to="/semesters" className="text-decoration-none">
                  <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis px-3 py-2 fw-bold xx-small">Set Session</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Slide-out Sidebar Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="menu-backdrop"
              onClick={() => setIsMenuOpen(false)}
            />
            
            {/* Drawer */}
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="side-menu bg-white shadow-2xl"
            >
              <div className="d-flex flex-column h-100">
                {/* Menu Header */}
                <div className="p-4 bg-primary text-white position-relative overflow-hidden">
                  <div className="position-absolute top-0 end-0 p-3 opacity-10">
                    <ShieldCheck size={100} />
                  </div>
                  <div className="d-flex justify-content-between align-items-start position-relative z-10">
                    <div className="brand-icon-small bg-white bg-opacity-20 rounded-3 p-2 mb-3">
                      <ShieldCheck size={28} className="text-warning" />
                    </div>
                    <button className="btn btn-white-glass rounded-circle p-1" onClick={() => setIsMenuOpen(false)}>
                      <X size={20} />
                    </button>
                  </div>
                  <h5 className="fw-black mb-0 letter-spacing-n1">PRESENSYS</h5>
                  <p className="xx-small fw-bold text-uppercase tracking-widest opacity-75 mb-0">Management Portal</p>
                </div>

                {/* User Profile Summary */}
                <div className="px-4 py-3 border-bottom bg-light d-flex align-items-center gap-3">
                  <div className="avatar-small bg-primary text-white fw-bold">
                    {profile?.full_name?.[0] || 'U'}
                  </div>
                  <div className="overflow-hidden">
                    <div className="fw-bold small text-dark text-truncate">{profile?.full_name || 'User'}</div>
                    <div className="xx-small text-muted text-uppercase fw-bold">{profile?.role} Account</div>
                  </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex-grow-1 p-3">
                  <div className="d-flex flex-column gap-2">
                    {navItems.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsMenuOpen(false)}
                        className={`nav-item-premium ${location.pathname === item.path ? 'active' : ''}`}
                      >
                        <div className="d-flex align-items-center gap-3">
                          <item.icon size={20} className="nav-icon" />
                          <span className="fw-bold small">{item.label}</span>
                        </div>
                        <ChevronRight size={14} className="arrow-icon" />
                      </Link>
                    ))}
                  </div>
                </nav>

                {/* Bottom Actions */}
                <div className="p-3 mt-auto border-top bg-light">
                  {profile?.role === 'admin' && (
                    <Link 
                      to="/admin" 
                      className="btn btn-outline-primary w-100 mb-2 py-2 rounded-3 fw-bold small d-flex align-items-center justify-content-center gap-2"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <ShieldCheck size={18} /> Admin Console
                    </Link>
                  )}
                  <button 
                    className="btn btn-link text-danger w-100 text-decoration-none fw-bold small d-flex align-items-center justify-content-center gap-2"
                    onClick={() => { signOut(); setIsMenuOpen(false); }}
                  >
                    <LogOut size={18} /> Sign Out
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="app-content">
        <div className="container-mobile">
          <Outlet />
        </div>
      </main>

      <style>{`
        .app-container {
          min-height: 100vh;
          background-color: #fcfcfd;
          display: flex;
          flex-direction: column;
        }

        .container-mobile {
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
        }

        .app-header {
          height: 64px;
          z-index: 1030;
        }

        .fw-black { font-weight: 900; }
        .letter-spacing-n1 { letter-spacing: -1px; }
        .xx-small { font-size: 10px; }
        .tracking-widest { letter-spacing: 2px; }

        /* Sidebar Styles */
        .menu-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          z-index: 2000;
        }

        .side-menu {
          position: fixed;
          top: 0;
          left: 0;
          width: 280px;
          height: 100%;
          z-index: 2001;
          border-top-right-radius: 30px;
          border-bottom-right-radius: 30px;
          overflow: hidden;
        }

        .nav-item-premium {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 14px;
          text-decoration: none;
          color: #6c757d;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .nav-item-premium.active {
          background: rgba(13, 110, 253, 0.08);
          color: #0d6efd;
        }

        .nav-item-premium.active .nav-icon { color: #0d6efd; }
        .nav-item-premium .arrow-icon { opacity: 0; transform: translateX(-10px); transition: all 0.2s; }
        .nav-item-premium.active .arrow-icon { opacity: 1; transform: translateX(0); }

        .avatar-small {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-white-glass {
          background: rgba(255,255,255,0.2);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
          backdrop-filter: blur(4px);
        }

        .spin { animation: rotation 2s infinite linear; }
        @keyframes rotation { from { transform: rotate(0deg); } to { transform: rotate(359deg); } }

        @media (min-width: 501px) {
          body { background-color: #f0f2f5; }
          .app-container {
            margin: 20px auto;
            max-width: 500px;
            height: calc(100vh - 40px);
            border-radius: 30px;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0,0,0,0.1);
            position: relative;
          }
          .side-menu {
            position: absolute;
            height: 100%;
          }
          .menu-backdrop { position: absolute; }
        }
      `}</style>
    </div>
  );
};

export default Layout;
