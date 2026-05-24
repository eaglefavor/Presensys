import { create } from 'zustand';
import { detectAppMode, type AppMode, onDisplayModeChange, applyAppModeAttribute } from '../lib/appModeDetector';

interface AppModeState {
  mode: AppMode;
  isAppMode: boolean;
  initialize: () => void;
  setMode: (mode: AppMode) => void;
}

/**
 * Zustand store for tracking app display mode
 * Detects whether the PWA is running as a standalone app or as a website
 */
export const useAppModeStore = create<AppModeState>((set) => ({
  mode: 'browser',
  isAppMode: false,

  /**
   * Initialize app mode detection and set up listeners
   * Call this once when the app starts
   */
  initialize: () => {
    // Detect current mode
    const mode = detectAppMode();
    applyAppModeAttribute();

    set({
      mode,
      isAppMode: mode === 'standalone' || mode === 'fullscreen',
    });

    // Listen for changes (e.g., user installing/uninstalling the app)
    onDisplayModeChange((newMode) => {
      set({
        mode: newMode,
        isAppMode: newMode === 'standalone' || newMode === 'fullscreen',
      });
    });
  },

  /**
   * Manually set the app mode (rarely needed)
   */
  setMode: (mode: AppMode) => {
    applyAppModeAttribute();
    set({
      mode,
      isAppMode: mode === 'standalone' || mode === 'fullscreen',
    });
  },
}));
