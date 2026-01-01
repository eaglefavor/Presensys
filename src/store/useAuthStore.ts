import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { type Session, type User } from '@supabase/supabase-js';

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
  setSession: (session: Session | null) => void;
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
    if (!user) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (!error) {
      set({ profile: data as Profile, loading: false });
    } else {
      set({ loading: false });
    }
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  }
}));
