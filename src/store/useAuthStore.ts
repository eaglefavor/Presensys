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

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  profileVerified: false,
  loading: true,
  
  setSession: async (session) => {
    set({ session, user: session?.user ?? null });
    
    if (session) {
      await get().fetchProfile();
    } else {
      set({ loading: false, profile: null, profileVerified: false });
    }
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    // Seed the UI with a cached profile while the server request is in-flight.
    // We intentionally do NOT set profileVerified here — security-sensitive
    // UI (e.g. the Admin route) must wait for the server confirmation below.
    const cachedProfile = localStorage.getItem('user_profile');
    if (cachedProfile) {
      try {
        const parsed = JSON.parse(cachedProfile);
        if (parsed.id === user.id) {
          set({ profile: parsed });
        }
      } catch {
        localStorage.removeItem('user_profile');
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error) {
      // Offline or network failure — keep the cached profile for offline use but
      // mark loading as done. profileVerified stays false so the Admin route
      // does not render on stale cached data.
      set({ loading: false });
    } else {
      localStorage.setItem('user_profile', JSON.stringify(data));
      set({ profile: data as Profile, profileVerified: true, loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('user_profile'); // Clear cache on logout
    
    // Stop the sync engine and unsubscribe from realtime before clearing data
    realtimeSync.cleanup();
    localStorage.removeItem('last_sync_timestamp');

    // CRITICAL: Wipe local data to prevent cross-account leakage and force re-sync on next login
    await db.transaction('rw', [db.semesters, db.students, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords], async () => {
      await db.semesters.clear();
      await db.students.clear();
      await db.courses.clear();
      await db.enrollments.clear();
      await db.attendanceSessions.clear();
      await db.attendanceRecords.clear();
    });

    set({ session: null, user: null, profile: null, profileVerified: false });
    window.location.href = '/login'; // Force full reload to reset all states
  }
}));