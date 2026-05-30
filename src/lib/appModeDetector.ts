/**
 * App Mode Detection
 * Detects whether the PWA is running in standalone/app mode or as a regular website.
 * Supports both iOS and Android detection methods.
 */

export type AppMode = 'standalone' | 'fullscreen' | 'browser';

/**
 * Detects the current app mode
 * @returns The app display mode
 */
export function detectAppMode(): AppMode {
  // Check if running in standalone mode (iOS)
  if ((navigator as any).standalone === true) {
    return 'standalone';
  }

  // Check if running in standalone mode (Android/Chrome)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return 'standalone';
  }

  // Check if running in fullscreen mode (future use)
  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return 'fullscreen';
  }

  // Default to browser mode
  return 'browser';
}

/**
 * Checks if running in app mode (standalone or fullscreen)
 * @returns true if running as an app
 */
export function isAppMode(): boolean {
  const mode = detectAppMode();
  return mode === 'standalone' || mode === 'fullscreen';
}

/**
 * Applies data-app-mode attribute to the document root
 * This enables CSS media query and attribute selectors to style accordingly
 */
export function applyAppModeAttribute(): void {
  const mode = detectAppMode();
  document.documentElement.setAttribute('data-app-mode', mode);
}

/**
 * Listens for changes in display mode (useful for PWA install/uninstall)
 * @param callback Function to call when display mode changes
 * @returns Unsubscribe function
 */
export function onDisplayModeChange(callback: (mode: AppMode) => void): () => void {
  const mediaQueryList = window.matchMedia('(display-mode: standalone)');

  const handleChange = () => {
    const newMode = detectAppMode();
    callback(newMode);
    applyAppModeAttribute();
  };

  // Modern API (preferred)
  if (mediaQueryList.addEventListener) {
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }

  // Legacy API fallback
  mediaQueryList.addListener?.(handleChange);
  return () => mediaQueryList.removeListener?.(handleChange);
}
