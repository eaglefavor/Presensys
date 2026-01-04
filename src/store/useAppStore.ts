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
      // 1. Check for manually set active semester
      let active = await db.semesters.filter(s => s.isActive).first();
      
      // 2. Intelligent Auto-Switch logic
      if (!active) {
        const today = new Date().toISOString().split('T')[0];
        const currentSemester = await db.semesters
          .filter(s => s.startDate <= today && s.endDate >= today)
          .first();

        if (currentSemester) {
          console.log('Auto-Activating Semester:', currentSemester.name);
          await db.transaction('rw', db.semesters, async () => {
            await db.semesters.toCollection().modify({ isActive: false });
            await db.semesters.update(currentSemester.id!, { isActive: true, synced: 0 });
          });
          active = currentSemester;
        }
      }

      set({ activeSemester: active || null });
    } catch (error) {
      console.error('Failed to initialize active semester:', error);
    }
  },

  refreshActiveSemester: async () => {
    try {
      const active = await db.semesters.filter(s => s.isActive).first();
      set({ activeSemester: active || null });
    } catch (error) {
      console.error('Failed to refresh active semester:', error);
    }
  }
}));
