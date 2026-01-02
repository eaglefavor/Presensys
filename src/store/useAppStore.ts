import { create } from 'zustand';
import { db, type Semester } from '../db/db';

interface AppState {
  activeSemester: Semester | null;
  setActiveSemester: (semester: Semester | null) => void;
  initialize: () => Promise<void>;
  refreshActiveSemester: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  activeSemester: null,
  setActiveSemester: (semester) => set({ activeSemester: semester }),
  
  initialize: async () => {
    try {
      const active = await db.semesters.where('isActive').equals(true as any).first();
      set({ activeSemester: active || null });
    } catch (error) {
      console.error('Failed to initialize active semester:', error);
    }
  },

  refreshActiveSemester: async () => {
    try {
      const active = await db.semesters.where('isActive').equals(true as any).first();
      set({ activeSemester: active || null });
    } catch (error) {
      console.error('Failed to refresh active semester:', error);
    }
  }
}));