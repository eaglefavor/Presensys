/**
 * safeStorage – a drop-in replacement for `localStorage` that falls back to
 * an in-memory Map when `localStorage` is unavailable (private-browsing mode,
 * strict browser storage settings, or storage-quota exhaustion).
 *
 * Swap all direct `localStorage.*` calls with `safeStorage.*` to ensure the
 * sync engine and auth store remain functional in every browser context.
 */

const _mem = new Map<string, string>();

/** Returns true if localStorage is accessible (checked once at module load). */
let _useLS = (() => {
  try {
    const k = '__presensys_ls_check__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
})();

export const safeStorage = {
  getItem(key: string): string | null {
    if (_useLS) {
      try {
        return localStorage.getItem(key);
      } catch {
        _useLS = false;
      }
    }
    return _mem.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    if (_useLS) {
      try {
        localStorage.setItem(key, value);
        return;
      } catch {
        _useLS = false;
      }
    }
    _mem.set(key, value);
  },

  removeItem(key: string): void {
    if (_useLS) {
      try {
        localStorage.removeItem(key);
        return;
      } catch {
        _useLS = false;
      }
    }
    _mem.delete(key);
  },
};
