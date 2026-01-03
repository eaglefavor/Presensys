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
    const { user } = get();
    if (!user) {
      console.warn('fetchProfile: No user found in state');
      return;
    }
    
    console.log('fetchProfile: Fetching profile for UUID:', user.id);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error) {
      console.error('fetchProfile: Error fetching profile:', error.message, error.details);
      set({ loading: false, profile: null });
    } else {
      console.log('fetchProfile: Success! Data received:', data);
      set({ profile: data as Profile, loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    
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