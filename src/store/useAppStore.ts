import { create } from 'zustand';
import { db, type Semester } from '../db/db.ts';

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
      // 1. Check for manually set active semesters
      const allActive = await db.semesters.filter(s => s.isActive === true && s.isDeleted !== 1).toArray();

      // Guard against multiple semesters being active simultaneously (e.g. from a
      // sync race). Deactivate all but the most recently updated one (3.3).
      if (allActive.length > 1) {
        console.warn(`AppStore: ${allActive.length} active semesters found — resolving conflict.`);
        const sorted = [...allActive].sort((a, b) => {
          const ua = a.updatedAt ?? a.createdAt ?? '';
          const ub = b.updatedAt ?? b.createdAt ?? '';
          return ub.localeCompare(ua); // most-recently-updated first
        });
        const [keep, ...deactivate] = sorted;
        await db.transaction('rw', db.semesters, async () => {
          await Promise.all(
            deactivate.map(s => db.semesters.update(s.id!, { isActive: false }))
          );
        });
        set({ activeSemester: keep });
        return;
      }

      let active: Semester | undefined = allActive[0];
      
      // 2. Intelligent Auto-Switch logic
      if (!active) {
        const today = new Date().toISOString().split('T')[0];
        const candidates = await db.semesters
          .filter(s => s.isDeleted !== 1 && s.startDate <= today && s.endDate >= today)
          .toArray();

        // Deterministic tie-break: prefer the most-recently-started semester; if still
        // tied, prefer the one with the most recent createdAt (8.5).
        let currentSemester: Semester | undefined;
        if (candidates.length > 0) {
          currentSemester = candidates.sort((a, b) => {
            if (b.startDate !== a.startDate) return b.startDate.localeCompare(a.startDate);
            return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
          })[0];
        }

        if (currentSemester) {
          await db.transaction('rw', db.semesters, async () => {
            const prevActive = await db.semesters
              .filter(s => s.isActive && s.id !== currentSemester!.id)
              .first();
            if (prevActive) {
              await db.semesters.update(prevActive.id!, { isActive: false });
            }
            await db.semesters.update(currentSemester!.id!, { isActive: true });
          });
          active = currentSemester;
        }
      }

      set({ activeSemester: active ?? null });
    } catch (error) {
      console.error('Failed to initialize active semester:', error);
    }
  },

  refreshActiveSemester: async () => {
    try {
      const active = await db.semesters.filter(s => s.isActive === true && s.isDeleted !== 1).first();
      set({ activeSemester: active ?? null });
    } catch (error) {
      console.error('Failed to refresh active semester:', error);
    }
  }
}));
