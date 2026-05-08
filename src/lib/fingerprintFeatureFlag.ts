/**
 * Fingerprint Blitz feature flag.
 *
 * Controls whether the Fingerprint Blitz attendance option is exposed to users.
 * Designed for a phased rollout and an emergency kill-switch without a
 * re-deploy.
 *
 * Priority (highest to lowest):
 *  1. Build-time env var  VITE_FINGERPRINT_ENABLED=false  → always disabled
 *  2. Operator localStorage override  fp_enabled=false     → disabled for this device
 *  3. Default: enabled
 */
export function isFingerprintEnabled(): boolean {
  // Build-time hard-disable (set in .env / CI to gate a release)
  if (import.meta.env.VITE_FINGERPRINT_ENABLED === 'false') return false;

  // Runtime operator kill-switch (localStorage, survives page refresh)
  try {
    const override = localStorage.getItem('fp_enabled');
    if (override === 'false') return false;
  } catch {
    // localStorage may be unavailable in some browser security modes
  }

  return true;
}
