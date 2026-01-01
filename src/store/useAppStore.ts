import { create } from 'zustand';
import { type Semester, db } from '../db/db';

interface AppState {
  activeSemester: Semester | null;
  setActiveSemester: (semester: Semester | null) => void;
  initialize: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  activeSemester: null,
  setActiveSemester: (semester) => set({ activeSemester: semester }),
  initialize: async () => {
    const active = await db.semesters.where('isActive').equals(1).first();
    if (active) {
      set({ activeSemester: active });
    }
  },
}));
