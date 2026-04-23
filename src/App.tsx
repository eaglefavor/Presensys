import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { Toaster } from 'react-hot-toast';

// Components (always loaded)
import Layout from './components/Layout';
import ReloadPrompt from './components/ReloadPrompt';

// Lazy-loaded pages (code-splitting for 3G optimization)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Semesters = lazy(() => import('./pages/Semesters'));
const Students = lazy(() => import('./pages/Students'));
const Courses = lazy(() => import('./pages/Courses'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Archives = lazy(() => import('./pages/Archives'));
const Auth = lazy(() => import('./pages/Auth'));
const VerifyAccess = lazy(() => import('./pages/VerifyAccess'));
const Admin = lazy(() => import('./pages/Admin'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  return (
    <div className="d-flex align-items-center justify-content-center py-5 min-vh-100">
      <div className="text-center">
        <div className="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
        <div className="xx-small fw-bold text-muted text-uppercase" style={{ letterSpacing: '2px', fontSize: '10px' }}>Loading...</div>
      </div>
    </div>
  );
}

function App() {
  const { session, profile, profileVerified, loading, setSession } = useAuthStore();
  const setActiveSemester = useAppStore(state => state.setActiveSemester);

  // Automatically sync active semester from DB to Store whenever it changes
  const activeSemesterFromDB = useLiveQuery(
    () => db.semesters.filter(s => s.isActive).first()
  );

  useEffect(() => {
    if (activeSemesterFromDB !== undefined) {
      setActiveSemester(activeSemesterFromDB || null);
    }
  }, [activeSemesterFromDB, setActiveSemester]);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on registration (equivalent to
    // getSession), so we don't need a separate getSession call.  Using both
    // caused two concurrent fetchProfile requests; on slow 3G the second
    // request could arrive after the optimistic "verified" update in
    // VerifyAccess and overwrite it with stale "pending" replica data,
    // sending the user back to the Activation Required page.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Token was silently refreshed; the user and profile are unchanged.
        // Only update the stored session tokens — avoid triggering a full
        // profile re-fetch (with loading:true) that could race with / overwrite
        // a recently-verified profile status.
        useAuthStore.setState({ session, user: session?.user ?? null });
      } else {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background: '#fff', color: '#333', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold' } }} />
      <ReloadPrompt />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={!session ? <Auth /> : <Navigate to="/" />} />
          <Route path="/signup" element={!session ? <Auth /> : <Navigate to="/" />} />

          {/* Protected Routes */}
          <Route path="/" element={
            !session ? <Navigate to="/login" /> :
              profile?.role?.toLowerCase() === 'admin' ? <Layout /> :
                profile?.status?.toLowerCase() === 'verified' ? <Layout /> :
                  <VerifyAccess />
          }>
            <Route index element={<Dashboard />} />
            <Route path="semesters" element={<Semesters />} />
            <Route path="students" element={<Students />} />
            <Route path="courses" element={<Courses />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="archives" element={<Archives />} />
            <Route path="settings" element={<Settings />} />

            {/* Admin only route — requires server-confirmed profile to prevent localStorage spoofing */}
            {profileVerified && profile?.role === 'admin' && (
              <Route path="admin" element={<Admin />} />
            )}
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;