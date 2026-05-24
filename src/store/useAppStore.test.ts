import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../db/db.ts';

test('useAppStore initialization tests', async (t) => {
  type UseAppStore = {
    setState: (state: { activeSemester: null }) => void;
    getState: () => {
      initialize: () => Promise<void>;
      activeSemester: { name?: string } | null;
    };
  };
  let useAppStore: UseAppStore;

  t.beforeEach(async () => {
    // We must isolate the module import to test different scenarios
    // But since node module cache is tricky with import(), we reset Zustand state directly.
    const mod = await import('./useAppStore.ts');
    useAppStore = mod.useAppStore;
    useAppStore.setState({ activeSemester: null });
  });

  await t.test('initialize sets active semester if one is manually set', async () => {
    const originalFilter = db.semesters.filter;
    db.semesters.filter = t.mock.fn(() => ({
      first: async () => ({ id: 1, name: 'Manually Active Sem', isActive: true })
    })) as unknown as typeof db.semesters.filter;

    await useAppStore.getState().initialize();

    assert.strictEqual(useAppStore.getState().activeSemester?.name, 'Manually Active Sem');
    db.semesters.filter = originalFilter;
  });

  await t.test('initialize auto-activates current semester if none is active', async () => {
    const originalFilter = db.semesters.filter;
    const originalTransaction = db.transaction;

    let transactionCalled = false;
    let filterCallCount = 0;

    db.semesters.filter = t.mock.fn(() => {
      filterCallCount++;
      return {
        first: async () => {
          if (filterCallCount === 1) return undefined; // No active semester
          if (filterCallCount === 2) return { id: 2, name: 'Current Sem', startDate: '2000-01-01', endDate: '2099-12-31' }; // Auto-activate this
          return undefined; // prevActive query inside transaction
        }
      };
    }) as unknown as typeof db.semesters.filter;

    db.transaction = t.mock.fn(async (...args: Parameters<typeof db.transaction>) => {
      transactionCalled = true;
      const callback = args[2] as unknown as () => Promise<void>;
      return callback();
    }) as unknown as typeof db.transaction;

    db.semesters.update = t.mock.fn(async () => 1) as unknown as typeof db.semesters.update;

    // Suppress console.log during test
    const originalLog = console.log;
    console.log = t.mock.fn<typeof console.log>();

    await useAppStore.getState().initialize();

    assert.strictEqual(useAppStore.getState().activeSemester?.name, 'Current Sem');
    assert.strictEqual(transactionCalled, true);

    console.log = originalLog;
    db.semesters.filter = originalFilter;
    db.transaction = originalTransaction;
  });

  await t.test('initialize does nothing if no semester is active and no current semester exists', async () => {
    const originalFilter = db.semesters.filter;

    db.semesters.filter = t.mock.fn(() => ({
      first: async () => undefined
    })) as unknown as typeof db.semesters.filter;

    await useAppStore.getState().initialize();

    assert.strictEqual(useAppStore.getState().activeSemester, null);

    db.semesters.filter = originalFilter;
  });
});
