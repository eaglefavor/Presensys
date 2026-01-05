import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { db } from '../db/db';
import type { Session, User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  full_name: string;
  role: 'admin' | 'rep';
  status: 'pending' | 'verified' | 'terminated';
  invalid_tries: number;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  setSession: (session: Session | null) => Promise<void>;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  
  setSession: async (session) => {
    set({ session, user: session?.user ?? null });
    
    if (session) {
      await get().fetchProfile();
    } else {
      set({ loading: false, profile: null });
    }
  },

  fetchProfile: async () => {
    const { user, profile } = get();
    if (!user) return;
    
    // Prevent redundant fetches if we already have the correct profile
    if (profile && profile.id === user.id) return;

    // 1. Try local cache
    const cachedProfile = localStorage.getItem('user_profile');
    if (cachedProfile) {
      const parsed = JSON.parse(cachedProfile);
      if (parsed.id === user.id) {
        set({ profile: parsed, loading: false });
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error) {
      if (navigator.onLine && !get().profile) {
         set({ loading: false, profile: null });
      }
    } else {
      localStorage.setItem('user_profile', JSON.stringify(data));
      set({ profile: data as Profile, loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('user_profile'); // Clear cache on logout
    
    // CRITICAL: Wipe local data to prevent cross-account leakage and force re-sync on next login
    await db.transaction('rw', [db.semesters, db.students, db.courses, db.enrollments, db.attendanceSessions, db.attendanceRecords], async () => {
      await db.semesters.clear();
      await db.students.clear();
      await db.courses.clear();
      await db.enrollments.clear();
      await db.attendanceSessions.clear();
      await db.attendanceRecords.clear();
    });

    set({ session: null, user: null, profile: null });
    window.location.href = '/login'; // Force full reload to reset all states
  }
}));