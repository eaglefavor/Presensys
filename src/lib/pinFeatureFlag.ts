/**
 * PIN Blitz feature flag.
 *
 * Priority:
 *  1. Build-time env var  VITE_PIN_BLITZ_ENABLED=false
 *  2. Runtime localStorage override pin_blitz_enabled=false
 *  3. Default: enabled
 */
export function isPinBlitzEnabled(): boolean {
  if (import.meta.env.VITE_PIN_BLITZ_ENABLED === 'false') return false;

  try {
    const override = localStorage.getItem('pin_blitz_enabled');
    if (override === 'false') return false;
  } catch {
    // localStorage unavailable in restrictive modes
  }

  return true;
}
