import { useAppModeStore } from '../store/useAppModeStore';

/**
 * Hook to access current app mode state
 * Returns the current display mode (standalone, fullscreen, or browser)
 * and a boolean indicating if running as an app
 */
export function useIsAppMode() {
  const mode = useAppModeStore((state) => state.mode);
  const isAppMode = useAppModeStore((state) => state.isAppMode);

  return {
    mode,
    isAppMode,
    isStandalone: mode === 'standalone',
    isFullscreen: mode === 'fullscreen',
    isBrowser: mode === 'browser',
  };
}

/**
 * Utility hook to conditionally apply styles or logic based on app mode
 * @example
 * const appMode = useAppMode();
 * return (
 *   <div>
 *     {appMode.isBrowser && <div>Show only in browser</div>}
 *     {appMode.isAppMode && <div>Show only in app</div>}
 *   </div>
 * );
 */
export function useAppMode() {
  return useIsAppMode();
}
