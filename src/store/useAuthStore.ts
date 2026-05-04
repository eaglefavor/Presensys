import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { db } from '../db/db';
import { realtimeSync } from '../lib/RealtimeSyncEngine';
import type { Session, User } from '@supabase/supabase-js';

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
// Call window.__presensysDebug() in Eruda console to dump full auth state.
function exposeDebugGlobal() {
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
exposeDebugGlobal();
// ──────────────────────────────────────────────────────────────────────────────


// Synchronous check to avoid initial loading flash if user is already cached
const getCachedSession = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const keys = Object.keys(localStorage);
    const authKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (authKey) {
      const data = JSON.parse(localStorage.getItem(authKey) || '{}');
      return data?.session || null;
    }
  } catch {
    // Ignore error
  }
  return null;
};

const getCachedProfile = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const cachedRaw = localStorage.getItem('user_profile');
    return cachedRaw ? JSON.parse(cachedRaw) : null;
  } catch {
    return null;
  }
};

const initialSession = getCachedSession();
const initialProfile = getCachedProfile();
// We only need loading if there's an initial session but NO initial profile
const initialLoading = !!initialSession && !initialProfile;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: initialSession,
  user: initialSession?.user ?? null,
  profile: initialProfile,
  profileVerified: false,
  loading: initialLoading,
  
  setSession: async (session) => {
    console.group('%c[AuthStore] setSession called', 'color:#2980b9;font-weight:bold');
    console.log('session present :', !!session);
    console.log('user email      :', session?.user?.email ?? 'none');
    console.log('user id         :', session?.user?.id ?? 'none');
    console.log('expires_at      :', session?.expires_at ?? 'n/a');

    const currentUser = get().user;
    let profileFromCache = get().profile;
    const isSameUser = session?.user?.id === currentUser?.id;
    const hasProfile = !!profileFromCache;

    // If we have a session but no profile loaded yet, try synchronously loading it from cache
    if (session && (!isSameUser || !hasProfile)) {
      const cachedRaw = localStorage.getItem('user_profile');
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          if (parsed.id === session.user.id) {
            profileFromCache = parsed;
          }
        } catch {
          // Ignore cache parse error
        }
      }
    }

    // Only block the UI with a loading spinner if we genuinely have no profile data to display
    // or if we have no session (loading should be false to show login)
    const needsLoading = !!session && !profileFromCache;

    set({
      session,
      user: session?.user ?? null,
      profile: profileFromCache,
      loading: needsLoading
    });

    console.log('→ store updated: loading=', needsLoading, 'profileFromCache=', !!profileFromCache);
    
    if (session) {
      console.log('→ calling fetchProfile…');
      console.groupEnd();
      // Fetch profile in the background, without forcing loading=true
      await get().fetchProfile();
    } else {
      set({ loading: false, profile: null, profileVerified: false });
      console.log('→ no session — cleared profile, loading=false');
      console.groupEnd();
    }
  },

  fetchProfile: async () => {
    const { user } = get();
    console.group('%c[AuthStore] fetchProfile called', 'color:#8e44ad;font-weight:bold');
    console.log('user.id :', user?.id ?? 'null — aborting');

    if (!user) {
      console.groupEnd();
      return;
    }

    // Seed the UI with a cached profile while the server request is in-flight.
    // We intentionally do NOT set profileVerified here — security-sensitive
    // UI (e.g. the Admin route) must wait for the server confirmation below.
    const cachedRaw = localStorage.getItem('user_profile');
    if (cachedRaw) {
      try {
        const parsed = JSON.parse(cachedRaw);
        console.log('cache hit — cached profile:', { id: parsed.id, role: parsed.role, status: parsed.status, invalid_tries: parsed.invalid_tries });
        if (parsed.id === user.id) {
          set({ profile: parsed });
          console.log('→ cache applied to store (profileVerified still false)');
        } else {
          console.warn('cache mismatch — cached id', parsed.id, 'vs user.id', user.id, '— ignoring cache');
        }
      } catch (e) {
        console.warn('cache parse error — removing:', e);
        localStorage.removeItem('user_profile');
      }
    } else {
      console.log('no cached profile found');
    }

    console.log('→ querying profiles table for id =', user.id);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .limit(1)
      .maybeSingle();
    
    console.log('← profiles query result:');
    console.log('  error :', error ?? 'none');
    console.log('  data  :', data);

    if (error) {
      // Offline or network failure — keep the cached profile for offline use but
      // mark loading as done. profileVerified stays false so the Admin route
      // does not render on stale cached data.
      console.warn('fetchProfile error — keeping cached profile, loading=false, profileVerified stays false');
      console.warn('error details:', error.message, '| code:', error.code, '| hint:', (error as { hint?: string }).hint);
      set({ loading: false });
    } else if (data === null) {
      console.error('⚠️ fetchProfile: profiles query returned NULL — no profile row found for this user!');
      console.error('This means the handle_new_user() trigger may not have created a profile row.');
      console.error('The user will be stuck on VerifyAccess indefinitely.');
      localStorage.removeItem('user_profile');
      set({ profile: null, profileVerified: true, loading: false });
    } else {
      const p = data as Profile;
      console.log('✅ profile fetched — role:', p.role, '| status:', p.status, '| invalid_tries:', p.invalid_tries);
      localStorage.setItem('user_profile', JSON.stringify(data));
      set({ profile: p, profileVerified: true, loading: false });
    }
    console.groupEnd();
  },

  signOut: async () => {
    console.log('%c[AuthStore] signOut called', 'color:#e74c3c;font-weight:bold');
    await supabase.auth.signOut();
    localStorage.removeItem('user_profile'); // Clear cache on logout

    // Stop the sync engine and unsubscribe from realtime before clearing data
    realtimeSync.cleanup();

    // Clear all sync-related localStorage keys to prevent cross-account data bleed
    const SYNC_TABLES = ['semesters', 'students', 'courses', 'enrollments', 'attendance_sessions', 'attendance_records'];
    SYNC_TABLES.forEach(t => localStorage.removeItem(`sync_cursor_${t}`));
    localStorage.removeItem('last_sync_timestamp');
    localStorage.removeItem('sync_status');
    localStorage.removeItem('sync_last_synced_at');

    // CRITICAL: Wipe local data to prevent cross-account leakage and force re-sync on next login.
    // Include outbox so stale pending writes are never replayed by the next user.
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
    window.location.href = '/login'; // Force full reload to reset all states
  }
}));
