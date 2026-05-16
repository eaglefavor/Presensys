import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import type { User } from '@supabase/supabase-js';

// We must dynamically import the module after globals are mocked
test('useAuthStore fetchProfile error handling', async (t) => {
  type UseAuthStore = {
    setState: (state: {
      user: User | null;
      profileVerified: boolean;
      loading: boolean;
      profile: { id: string; full_name: string; role: string; status: string; invalid_tries: number } | null;
    }) => void;
    getState: () => {
      fetchProfile: () => Promise<void>;
      loading: boolean;
      profileVerified: boolean;
      profile: { id: string } | null;
    };
  };
  type SupabaseClientLike = {
    from: (table: string) => {
      select: () => {
        eq: (column: string, value: string) => {
          limit: (count: number) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message: string; code: string } | null }>
          }
        }
      }
    }
  };
  let useAuthStore: UseAuthStore;
  let supabase: SupabaseClientLike;

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
    supabase = supabaseMod.supabase as unknown as SupabaseClientLike;

    const mod = await import('./useAuthStore.ts');
    useAuthStore = mod.useAuthStore;

    // Reset state before test
    useAuthStore.setState({
      user: { id: 'test-user-id' } as User,
      profileVerified: false,
      loading: true,
      profile: { id: 'cached-id', full_name: 'Cached User', role: 'rep', status: 'pending', invalid_tries: 0 }
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
    })) as SupabaseClientLike['from'];

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
