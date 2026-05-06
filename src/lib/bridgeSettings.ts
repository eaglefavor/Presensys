/**
 * Persists the fingerprint bridge WebSocket URL in localStorage so that any
 * bridge address (e.g. a remote device on the same LAN, a non-default port)
 * can be configured once from the Settings page and reused everywhere.
 */

const STORAGE_KEY = 'fp_bridge_url';
const DEFAULT_URL = 'ws://localhost:8080';

export function getBridgeUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export function setBridgeUrl(url: string): void {
  try {
    const trimmed = url.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}
