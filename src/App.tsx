import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';

// Components
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Semesters from './pages/Semesters';
import Students from './pages/Students';
import Courses from './pages/Courses';
import Attendance from './pages/Attendance';
import Archives from './pages/Archives';
import Auth from './pages/Auth';
import VerifyAccess from './pages/VerifyAccess';
import Admin from './pages/Admin';
import ReloadPrompt from './components/ReloadPrompt';

function App() {
  const { session, profile, loading, setSession } = useAuthStore();
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
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    }).catch(() => {
      useAuthStore.setState({ loading: false });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
      <ReloadPrompt />
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
          
          {/* Admin only route */}
          {profile?.role === 'admin' && (
            <Route path="admin" element={<Admin />} />
          )}
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;