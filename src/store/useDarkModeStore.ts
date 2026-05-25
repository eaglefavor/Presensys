import { create } from 'zustand';

interface DarkModeState {
  isDarkMode: boolean;
  initialize: () => void;
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;
}

/**
 * Zustand store for managing dark mode state
 * Persists preference to localStorage
 */
export const useDarkModeStore = create<DarkModeState>((set) => ({
  isDarkMode: false,

  /**
   * Initialize dark mode based on localStorage or system preference
   */
  initialize: () => {
    const stored = localStorage.getItem('darkMode');
    let isDarkMode = false;

    if (stored !== null) {
      // Use stored preference
      isDarkMode = stored === 'true';
    } else {
      // Fall back to system preference
      isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    set({ isDarkMode });
    applyDarkMode(isDarkMode);
  },

  /**
   * Toggle dark mode
   */
  toggleDarkMode: () => {
    set((state) => {
      const newValue = !state.isDarkMode;
      localStorage.setItem('darkMode', String(newValue));
      applyDarkMode(newValue);
      return { isDarkMode: newValue };
    });
  },

  /**
   * Set dark mode to a specific value
   */
  setDarkMode: (isDark: boolean) => {
    set({ isDarkMode: isDark });
    localStorage.setItem('darkMode', String(isDark));
    applyDarkMode(isDark);
  },
}));

/**
 * Apply dark mode class to the root element
 */
function applyDarkMode(isDark: boolean) {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark-mode');
  } else {
    root.classList.remove('dark-mode');
  }
}
