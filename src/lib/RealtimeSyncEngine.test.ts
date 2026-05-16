import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import 'fake-indexeddb/auto';
import { db, type LocalAttendanceSession, type LocalStudent } from '../db/db';
import type { SyncStatus } from './RealtimeSyncEngine';

type Listener = () => void;
const windowListeners = new Map<string, Listener>();
Object.defineProperty(globalThis, 'window', {
  value: {
    addEventListener: mock.fn((event: string, listener: Listener) => {
      windowListeners.set(event, listener);
    }),
    removeEventListener: mock.fn((event: string) => {
      windowListeners.delete(event);
    }),
  },
  writable: true
});

Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true
});

Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: mock.fn(),
    setItem: mock.fn(),
    removeItem: mock.fn(),
  },
  writable: true
});

// Since we're using Node, mock console methods to avoid test output noise
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

const { RealtimeSyncEngine } = await import('./RealtimeSyncEngine.ts');

describe('RealtimeSyncEngine - sync()', () => {
  type EnginePrivate = InstanceType<typeof RealtimeSyncEngine> & {
    userId: string | null;
    isSyncing: boolean;
    retryCount: number;
    retryTimer: ReturnType<typeof setTimeout> | null;
    maxRetries: number;
    sync: () => Promise<void>;
    pullChanges: () => Promise<void>;
    selfHealData: () => Promise<void>;
    pushChanges: () => Promise<void>;
    meticulousPurge: () => Promise<void>;
    emitStatus: (status: SyncStatus) => void;
    handleRealtimeEvent: (tableName: string, table: unknown, payload: unknown) => Promise<void>;
  };

  let engine: EnginePrivate;
  let emitStatusMock: ReturnType<typeof mock.fn<(status: SyncStatus) => void>>;
  let consoleLogMock: ReturnType<typeof mock.fn<typeof console.log>>;
  let consoleErrorMock: ReturnType<typeof mock.fn<typeof console.error>>;

  beforeEach(async () => {
    // Suppress console output during tests
    consoleLogMock = mock.fn<typeof console.log>();
    consoleErrorMock = mock.fn<typeof console.error>();
    console.log = consoleLogMock;
    console.error = consoleErrorMock;

    // Enable fake timers
    mock.timers.enable({ apis: ['setTimeout'] }); // Removed clearTimeout

    windowListeners.clear();

    await db.delete();
    await db.open();

    engine = new RealtimeSyncEngine() as EnginePrivate;

    // Set up basic state
    engine.userId = 'user-123';
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true });
    engine.isSyncing = false;
    engine.retryCount = 0;

    // Mock the inner methods called by sync()
    engine.pullChanges = mock.fn(async () => {});
    engine.selfHealData = mock.fn(async () => {});
    engine.pushChanges = mock.fn(async () => {});
    engine.meticulousPurge = mock.fn(async () => {});

    // Mock emitStatus
    emitStatusMock = mock.fn<(status: SyncStatus) => void>();
    engine.emitStatus = emitStatusMock;
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Restore timers and mocks
    mock.timers.reset();
    mock.restoreAll();
  });

  test('sync - successful execution calls all four steps', async () => {
    await engine.sync();

    assert.strictEqual(engine.pullChanges.mock.callCount(), 1);
    assert.strictEqual(engine.selfHealData.mock.callCount(), 1);
    assert.strictEqual(engine.pushChanges.mock.callCount(), 1);
    assert.strictEqual(engine.meticulousPurge.mock.callCount(), 1);

    // Check emitStatus calls
    const emitStatusCalls = emitStatusMock.mock.calls.map(call => call.arguments[0] as SyncStatus);
    assert.deepStrictEqual(emitStatusCalls, ['syncing', 'synced']);

    // Check state updates
    assert.strictEqual(engine.retryCount, 0);
    assert.strictEqual(engine.isSyncing, false);
  });

  test('sync - aborts early if no userId', async () => {
    engine.userId = null;
    await engine.sync();

    assert.strictEqual(engine.isSyncing, false);
    assert.strictEqual(engine.emitStatus.mock.callCount(), 0);
    assert.strictEqual(engine.pullChanges.mock.callCount(), 0);
  });

  test('sync - aborts early if offline', async () => {
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true });
    await engine.sync();

    assert.strictEqual(engine.isSyncing, false);
    assert.strictEqual(engine.emitStatus.mock.callCount(), 0);
    assert.strictEqual(engine.pullChanges.mock.callCount(), 0);
  });

  test('sync - aborts early if already syncing', async () => {
    engine.isSyncing = true;
    await engine.sync();

    assert.strictEqual(engine.isSyncing, true); // Stays true
    assert.strictEqual(engine.emitStatus.mock.callCount(), 0);
    assert.strictEqual(engine.pullChanges.mock.callCount(), 0);
  });

  test('sync - handles error and triggers retry', async () => {
    const error = new Error('Network failure');
    engine.pullChanges = mock.fn(async () => { throw error; });

    // Mock sync itself so we can see if it was called recursively by setTimeout
    const originalSync = engine.sync.bind(engine);
    let syncCallCount = 0;
    engine.sync = async () => {
      syncCallCount++;
      return originalSync();
    };

    await engine.sync(); // Initial call

    assert.strictEqual(engine.isSyncing, false);

    // Should emit 'syncing' status initially
    const emitStatusCalls = emitStatusMock.mock.calls.map(call => call.arguments[0] as SyncStatus);
    assert.deepStrictEqual(emitStatusCalls, ['syncing']);

    // Should log the error and retry
    assert.strictEqual(consoleErrorMock.mock.callCount(), 1);
    assert.strictEqual(consoleLogMock.mock.callCount(), 1);

    // Check retry logic
    assert.strictEqual(engine.retryCount, 1);
    assert.ok(engine.retryTimer !== null);

    // Fast-forward timer to trigger retry
    mock.timers.tick(2000); // 1000 * 2^1 = 2000ms

    assert.strictEqual(syncCallCount, 2); // Initial + Retry
  });

  test('sync - emits error status when max retries reached', async () => {
    const error = new Error('Persistent failure');
    engine.pullChanges = mock.fn(async () => { throw error; });

    // Start at max retries
    engine.retryCount = engine.maxRetries;

    await engine.sync();

    assert.strictEqual(engine.isSyncing, false);

    // Should emit 'syncing' then 'error'
    const emitStatusCalls = emitStatusMock.mock.calls.map(call => call.arguments[0] as SyncStatus);
    assert.deepStrictEqual(emitStatusCalls, ['syncing', 'error']);

    // Check error logs
    assert.strictEqual(consoleErrorMock.mock.callCount(), 2); // Error trace + max retries reached message
  });

  test('sync - network transition to offline sets status to offline', async () => {
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true });
    const offlineListener = windowListeners.get('offline');
    offlineListener?.();
    assert.strictEqual(emitStatusMock.mock.calls.some(call => call.arguments[0] === 'offline'), true);
  });

  test('sync - online transition resets retry and triggers sync', async () => {
    engine.retryCount = 2;
    const syncMock = mock.fn(async () => {});
    engine.sync = syncMock as unknown as EnginePrivate['sync'];
    const onlineListener = windowListeners.get('online');
    onlineListener?.();
    assert.strictEqual(engine.retryCount, 0);
    assert.strictEqual(syncMock.mock.callCount(), 1);
  });

  test('realtime update respects LWW when local record is newer', async () => {
    const localSession: LocalAttendanceSession = {
      serverId: 'session-1',
      courseId: 'course-1',
      date: '2024-01-01',
      title: 'Local Session',
      lecturerId: undefined,
      isDeleted: 0,
      synced: 0,
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const id = await db.attendanceSessions.add(localSession);

    const payload = {
      eventType: 'UPDATE',
      new: {
        id: 'session-1',
        course_id: 'course-1',
        date: '2024-01-01',
        title: 'Server Session',
        is_deleted: 0,
        updated_at: '2024-01-01T00:00:00Z',
      },
      old: {},
    };

    await engine.handleRealtimeEvent('attendance_sessions', db.attendanceSessions, payload);

    const updated = await db.attendanceSessions.get(id);
    assert.strictEqual(updated?.title, 'Local Session');
  });

  test('realtime delete marks local tombstone', async () => {
    const localStudent: LocalStudent = {
      serverId: 'student-1',
      regNumber: '2020123456',
      name: 'Test Student',
      isDeleted: 0,
      synced: 1,
    };
    const id = await db.students.add(localStudent);

    const payload = {
      eventType: 'DELETE',
      new: {},
      old: { id: 'student-1' },
    };

    await engine.handleRealtimeEvent('students', db.students, payload);

    const updated = await db.students.get(id);
    assert.strictEqual(updated?.isDeleted, 1);
    assert.strictEqual(updated?.synced, 1);
  });

});
