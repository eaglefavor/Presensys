import 'fake-indexeddb/auto';
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PresensysDB, type LocalSemester } from './db.ts';

describe('PresensysDB', () => {
  let testDb: PresensysDB;

  beforeEach(() => {
    testDb = new PresensysDB();
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  test('should create a new instance', () => {
    assert.ok(testDb);
  });

  test('creates a semester and adds to outbox', async () => {
    let notified = false;
    testDb.onLocalChange(() => { notified = true; });

    const id = await testDb.semesters.add({
      name: 'Test Sem',
      startDate: '2023-01-01',
      endDate: '2023-06-01',
      isActive: true,
      isArchived: false,
    } as unknown as LocalSemester);

    const sem = await testDb.semesters.get(id);
    assert.ok(sem);
    assert.ok(sem.serverId);
    assert.ok(sem.createdAt);
    assert.ok(sem.updatedAt);
    assert.strictEqual(sem.isDeleted, 0);
    assert.strictEqual(sem.synced, 0);

    // Wait for the asynchronous outbox micro-transaction
    await new Promise(resolve => setTimeout(resolve, 50));

    const outboxEntries = await testDb.outbox.toArray();
    assert.strictEqual(outboxEntries.length, 1);
    assert.strictEqual(outboxEntries[0].tableName, 'semesters');
    assert.strictEqual(outboxEntries[0].operation, 'upsert');
    assert.strictEqual(outboxEntries[0].serverId, sem.serverId);

    assert.strictEqual(notified, true);
  });

  test('updates a semester and adds to outbox', async () => {
    const id = await testDb.semesters.add({
      name: 'Test Sem',
      startDate: '2023-01-01',
      endDate: '2023-06-01',
      isActive: true,
      isArchived: false,
    } as unknown as LocalSemester);

    await new Promise(resolve => setTimeout(resolve, 50));
    await testDb.outbox.clear();

    const sem = await testDb.semesters.get(id);
    assert.ok(sem);

    let notified = false;
    testDb.onLocalChange(() => { notified = true; });

    await testDb.semesters.update(id, { name: 'Updated Sem' });

    const updatedSem = await testDb.semesters.get(id);
    assert.strictEqual(updatedSem?.name, 'Updated Sem');
    assert.notStrictEqual(updatedSem?.updatedAt, sem.updatedAt);
    assert.strictEqual(updatedSem?.synced, 0);

    // Wait for the asynchronous outbox micro-transaction
    await new Promise(resolve => setTimeout(resolve, 50));

    const outboxEntries = await testDb.outbox.toArray();
    assert.strictEqual(outboxEntries.length, 1);
    assert.strictEqual(outboxEntries[0].tableName, 'semesters');
    assert.strictEqual(outboxEntries[0].operation, 'upsert');
    assert.strictEqual(outboxEntries[0].serverId, sem.serverId);

    assert.strictEqual(notified, true);
  });

  test('soft deletes a semester and adds delete to outbox', async () => {
    const id = await testDb.semesters.add({
      name: 'Test Sem',
      startDate: '2023-01-01',
      endDate: '2023-06-01',
      isActive: true,
      isArchived: false,
    } as unknown as LocalSemester);

    await new Promise(resolve => setTimeout(resolve, 50));
    await testDb.outbox.clear();

    const sem = await testDb.semesters.get(id);
    assert.ok(sem);

    await testDb.semesters.update(id, { isDeleted: 1 });

    // Wait for the asynchronous outbox micro-transaction
    await new Promise(resolve => setTimeout(resolve, 50));

    const outboxEntries = await testDb.outbox.toArray();
    assert.strictEqual(outboxEntries.length, 1);
    assert.strictEqual(outboxEntries[0].tableName, 'semesters');
    assert.strictEqual(outboxEntries[0].operation, 'delete');
    assert.strictEqual(outboxEntries[0].serverId, sem.serverId);
  });

  test('sync engine confirm does not add to outbox', async () => {
    const id = await testDb.semesters.add({
      name: 'Test Sem',
      startDate: '2023-01-01',
      endDate: '2023-06-01',
      isActive: true,
      isArchived: false,
    } as unknown as LocalSemester);

    await new Promise(resolve => setTimeout(resolve, 50));
    await testDb.outbox.clear();

    let notified = false;
    testDb.onLocalChange(() => { notified = true; });

    await testDb.semesters.update(id, { synced: 1 });

    // Wait for the asynchronous outbox micro-transaction
    await new Promise(resolve => setTimeout(resolve, 50));

    const outboxEntries = await testDb.outbox.toArray();
    assert.strictEqual(outboxEntries.length, 0);
    assert.strictEqual(notified, false);
  });

  test('deleting a record does not add to outbox', async () => {
    const id = await testDb.semesters.add({
      name: 'Test Sem',
      startDate: '2023-01-01',
      endDate: '2023-06-01',
      isActive: true,
      isArchived: false,
    } as unknown as LocalSemester);

    await new Promise(resolve => setTimeout(resolve, 50));
    await testDb.outbox.clear();

    let notified = false;
    testDb.onLocalChange(() => { notified = true; });

    await testDb.semesters.delete(id);

    // Wait for the asynchronous outbox micro-transaction
    await new Promise(resolve => setTimeout(resolve, 50));

    const outboxEntries = await testDb.outbox.toArray();
    assert.strictEqual(outboxEntries.length, 0);
    assert.strictEqual(notified, true);
  });
});
