/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

// We must dynamically import the module after globals are mocked
test('useAuthStore fetchProfile error handling', async (t) => {
  let useAuthStore: any;
  let supabase: any;

  t.beforeEach(async () => {
    // 1. Setup DOM globals required by RealtimeSyncEngine/Zustand
    const dom = new JSDOM('', { url: 'http://localhost' });
    Object.defineProperty(global, 'window', { value: dom.window, writable: true, configurable: true });
    Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
    Object.defineProperty(global, 'localStorage', {
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      writable: true, configurable: true
    });

    // 2. Import modules
    const supabaseMod = await import('../lib/supabase.ts');
    supabase = supabaseMod.supabase;

    const mod = await import('./useAuthStore.ts');
    useAuthStore = mod.useAuthStore;

    // Reset state before test
    useAuthStore.setState({
      user: { id: 'test-user-id' } as any,
      profileVerified: false,
      loading: true,
      profile: { id: 'cached-id', role: 'rep' } as any // pre-existing cached profile
    });
  });

  await t.test('fetchProfile on error sets loading=false, keeps profileVerified=false, and retains cached profile', async () => {
    // Mock supabase chain: from().select().eq().limit().maybeSingle()
    const originalFrom = supabase.from;
    supabase.from = t.mock.fn(() => ({
      select: t.mock.fn(() => ({
        eq: t.mock.fn(() => ({
          limit: t.mock.fn(() => ({
            maybeSingle: t.mock.fn(async () => ({
              data: null,
              error: { message: 'Network offline or error', code: '500' }
            }))
          }))
        }))
      }))
    }));

    await useAuthStore.getState().fetchProfile();

    const state = useAuthStore.getState();

    assert.strictEqual(state.loading, false, 'Loading should be false after error');
    assert.strictEqual(state.profileVerified, false, 'profileVerified MUST stay false on error to prevent admin access');
    assert.ok(state.profile, 'Cached profile should be retained for offline use');
    assert.strictEqual(state.profile.id, 'cached-id', 'Cached profile data should be untouched');

    // Restore original method
    supabase.from = originalFrom;
  });
});
