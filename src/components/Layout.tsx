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
  RefreshCw
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { syncEngine } from '../lib/syncEngine';

const Layout: React.FC = () => {
  const activeSemester = useAppStore(state => state.activeSemester);
  const location = useLocation();
  const navigate = useNavigate();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>('synced');

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

    // Initial sync
    performSync();

    // Sync when coming back online
    window.addEventListener('online', performSync);
    window.addEventListener('offline', () => setSyncStatus('offline'));

    // Periodic sync every 30 seconds
    const interval = setInterval(performSync, 30000);

    return () => {
      window.removeEventListener('online', performSync);
      window.removeEventListener('offline', () => setSyncStatus('offline'));
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    { path: '/', label: 'Home', icon: LayoutDashboard },
    { path: '/attendance', label: 'Mark', icon: CheckSquare },
    { path: '/students', label: 'Students', icon: Users },
    { path: '/courses', label: 'Courses', icon: BookOpen },
    { path: '/archives', label: 'Search', icon: Archive },
  ];

  // Helper to determine if we are in a sub-page (for back button)
  const isRootPath = location.pathname === '/' || navItems.some(item => item.path === location.pathname);

  return (
    <div className="app-container">
      {/* Top Header - Native App Style */}
      <header className="app-header shadow-sm border-bottom bg-white sticky-top">
        <div className="container-mobile d-flex align-items-center justify-content-between px-3 h-100">
          <div className="d-flex align-items-center gap-2">
            {!isRootPath && (
              <button className="btn btn-link text-dark p-0 me-2" onClick={() => navigate(-1)}>
                <ChevronLeft size={24} />
              </button>
            )}
            <div className="sync-indicator me-1">
              {syncStatus === 'syncing' && <RefreshCw size={18} className="text-primary spin" />}
              {syncStatus === 'synced' && <CloudSync size={18} className="text-success" />}
              {syncStatus === 'offline' && <CloudOff size={18} className="text-muted" />}
              {syncStatus === 'error' && <CloudOff size={18} className="text-danger" />}
            </div>
            <h1 className="h6 mb-0 fw-bold text-primary">Presensys</h1>
          </div>
          
          <div className="active-sem-pill">
            {activeSemester ? (
              <Link to="/semesters" className="text-decoration-none">
                <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-3 py-2">
                  {activeSemester.name.split(' ')[0]}
                </span>
              </Link>
            ) : (
              <Link to="/semesters" className="text-decoration-none">
                <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis px-3 py-2">Set Semester</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content pb-5 mb-5">
        <div className="container-mobile p-3">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav border-top bg-white fixed-bottom shadow-lg">
        <div className="container-mobile d-flex justify-content-around align-items-center h-100">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link-mobile ${location.pathname === item.path ? 'active' : ''}`}
            >
              <item.icon size={22} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <style>{`
        .app-container {
          min-height: 100vh;
          background-color: #fcfcfd;
          display: flex;
          flex-direction: column;
        }

        /* The "Framing" Logic */
        .container-mobile {
          width: 100%;
          max-width: 500px; /* Constrain to mobile width on desktop */
          margin: 0 auto;
        }

        .app-header {
          height: 60px;
          z-index: 1030;
        }

        .bottom-nav {
          height: 70px;
          padding-bottom: env(safe-area-inset-bottom);
          z-index: 1030;
        }

        .nav-link-mobile {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          color: #6c757d;
          font-size: 11px;
          font-weight: 500;
          flex: 1;
          height: 100%;
          transition: all 0.2s;
        }

        .nav-link-mobile.active {
          color: var(--bs-primary);
        }

        .nav-icon {
          margin-bottom: 4px;
        }

        .nav-link-mobile.active .nav-icon {
          transform: translateY(-2px);
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .spin {
          animation: rotation 2s infinite linear;
        }

        @keyframes rotation {
          from { transform: rotate(0deg); }
          to { transform: rotate(359deg); }
        }

        .active-sem-pill .badge {
          font-size: 11px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        @media (min-width: 501px) {
          body {
            background-color: #f0f2f5;
          }
          .app-container {
            /* On desktop, show it like a floating mobile app */
            margin: 20px auto;
            max-width: 500px;
            height: calc(100vh - 40px);
            border-radius: 30px;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0,0,0,0.1);
            position: relative;
          }
          .fixed-bottom {
            position: absolute;
            max-width: 500px;
            left: 0;
            right: 0;
          }
          .sticky-top {
            position: sticky;
          }
        }
      `}</style>
    </div>
  );
};

export default Layout;