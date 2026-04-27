import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { db } from '../db/db';
import { realtimeSync } from '../lib/RealtimeSyncEngine';
import { safeStorage } from '../lib/safeStorage';
import toast from 'react-hot-toast';
import type { Session, User } from '@supabase/supabase-js';

const isDev = import.meta.env.DEV;

interface Profile {
  id: string;
  full_name: string;
  role: 'admin' | 'rep';
  status: 'pending' | 'verified' | 'terminated';
  invalid_tries: number;
  faculty?: string;
  department?: string;
  level?: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileVerified: boolean; // true only after a successful server fetch (not from cache)
  loading: boolean;
  setSession: (session: Session | null) => Promise<void>;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

// ─── Debug helper ─────────────────────────────────────────────────────────────
// Only exposed in development builds to prevent information leakage in
// production (6.2). Call window.__presensysDebug() in Eruda to dump state.
if (isDev) {
  (window as unknown as Record<string, unknown>)['__presensysDebug'] = () => {
    const s = useAuthStore.getState();
    console.group('%c[PRESENSYS DEBUG] Full Auth State', 'color:#e67e22;font-weight:bold;font-size:14px');
    console.log('loading        :', s.loading);
    console.log('session        :', s.session ? `✅ active (user=${s.session.user?.email})` : '❌ null');
    console.log('user.id        :', s.user?.id ?? 'null');
    console.log('profileVerified:', s.profileVerified);
    console.log('profile (full) :', s.profile);
    console.groupEnd();
    return s;
  };
  console.log('%c[PRESENSYS] Debug helper ready — call window.__presensysDebug() in Eruda console', 'color:#27ae60;font-size:12px');
}
// ──────────────────────────────────────────────────────────────────────────────

const SYNC_TABLES = ['semesters', 'students', 'courses', 'enrollments', 'attendance_sessions', 'attendance_records'];

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  profileVerified: false,
  loading: true,
  
  setSession: async (session) => {
    if (isDev) {
      console.group('%c[AuthStore] setSession called', 'color:#2980b9;font-weight:bold');
      console.log('session present :', !!session);
      console.log('user email      :', session?.user?.email ?? 'none');
      console.log('user id         :', session?.user?.id ?? 'none');
      console.log('expires_at      :', session?.expires_at ?? 'n/a');
    }

    set({ session, user: session?.user ?? null, loading: !!session });

    if (isDev) console.log('→ store updated: loading=', !!session);
    
    if (session) {
      if (isDev) { console.log('→ calling fetchProfile…'); console.groupEnd(); }
      await get().fetchProfile();
    } else {
      set({ loading: false, profile: null, profileVerified: false });
      if (isDev) { console.log('→ no session — cleared profile, loading=false'); console.groupEnd(); }
    }
  },

  fetchProfile: async () => {
    const { user } = get();
    if (isDev) {
      console.group('%c[AuthStore] fetchProfile called', 'color:#8e44ad;font-weight:bold');
      console.log('user.id :', user?.id ?? 'null — aborting');
    }

    if (!user) {
      if (isDev) console.groupEnd();
      return;
    }

    // Seed the UI with a cached profile while the server request is in-flight.
    const cachedRaw = safeStorage.getItem('user_profile');
    if (cachedRaw) {
      try {
        const parsed = JSON.parse(cachedRaw) as Profile;
        if (parsed.id === user.id) {
          set({ profile: parsed });
          if (isDev) console.log('→ cache applied (profileVerified still false)');
        } else {
          if (isDev) console.warn('cache mismatch — ignoring');
          safeStorage.removeItem('user_profile');
        }
      } catch (e) {
        if (isDev) console.warn('cache parse error — removing:', e);
        safeStorage.removeItem('user_profile');
      }
    }

    if (isDev) console.log('→ querying profiles table for id =', user.id);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .limit(1)
      .maybeSingle();
    
    if (isDev) { console.log('← profiles query result:'); console.log('  error :', error ?? 'none'); console.log('  data  :', data); }

    if (error) {
      // Offline or network failure — keep the cached profile for offline use.
      if (isDev) console.warn('fetchProfile error — keeping cached profile, loading=false');
      set({ loading: false });
      // Inform the user so they know they are running on cached data (5.2).
      if (!navigator.onLine) {
        toast('Running offline — using cached profile.', { icon: '📶', duration: 4000 });
      }
    } else if (data === null) {
      if (isDev) console.error('⚠️ fetchProfile: no profile row found for this user!');
      safeStorage.removeItem('user_profile');
      set({ profile: null, profileVerified: true, loading: false });
    } else {
      const p = data as Profile;
      if (isDev) console.log('✅ profile fetched — role:', p.role, '| status:', p.status);

      // Account suspension check (8.6): if the admin has terminated this account,
      // clear local data immediately and redirect to a locked-out page.
      if (p.status === 'terminated') {
        if (isDev) console.warn('Account terminated — clearing local data.');
        toast.error('Your account has been suspended. Please contact your administrator.');
        safeStorage.removeItem('user_profile');
        await get().signOut();
        return;
      }

      safeStorage.setItem('user_profile', JSON.stringify(data));
      set({ profile: p, profileVerified: true, loading: false });
    }
    if (isDev) console.groupEnd();
  },

  signOut: async () => {
    if (isDev) console.log('%c[AuthStore] signOut called', 'color:#e74c3c;font-weight:bold');
    await supabase.auth.signOut();
    safeStorage.removeItem('user_profile');

    // Stop the sync engine and unsubscribe from realtime before clearing data
    realtimeSync.cleanup();

    // Clear all sync-related storage keys to prevent cross-account data bleed
    SYNC_TABLES.forEach(t => safeStorage.removeItem(`sync_cursor_${t}`));
    safeStorage.removeItem('last_sync_timestamp');
    safeStorage.removeItem('sync_status');
    safeStorage.removeItem('sync_last_synced_at');

    // CRITICAL: Wipe local data to prevent cross-account leakage and force re-sync on next login.
    await db.transaction('rw', [db.semesters, db.students, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords, db.outbox], async () => {
      await db.semesters.clear();
      await db.students.clear();
      await db.courses.clear();
      await db.enrollments.clear();
      await db.attendanceSessions.clear();
      await db.attendanceRecords.clear();
      await db.outbox.clear();
    });

    set({ session: null, user: null, profile: null, profileVerified: false });
    window.location.href = '/login';
  }
}));
