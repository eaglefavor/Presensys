import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatTimeAgo } from './dateUtils';

describe('formatTimeAgo', () => {
  test('returns "just now" for very recent timestamps', () => {
    const now = new Date().toISOString();
    assert.strictEqual(formatTimeAgo(now), 'just now');
  });

  test('returns "Xm ago" for timestamps within an hour', () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    assert.strictEqual(formatTimeAgo(fiveMinsAgo), '5m ago');

    const fiftyNineMinsAgo = new Date(Date.now() - 59 * 60_000).toISOString();
    assert.strictEqual(formatTimeAgo(fiftyNineMinsAgo), '59m ago');
  });

  test('returns "Xh ago" for timestamps within a day', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    assert.strictEqual(formatTimeAgo(twoHoursAgo), '2h ago');

    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60_000).toISOString();
    assert.strictEqual(formatTimeAgo(twentyThreeHoursAgo), '23h ago');
  });

  test('returns "Xd ago" for timestamps more than a day old', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    assert.strictEqual(formatTimeAgo(twoDaysAgo), '2d ago');

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString();
    assert.strictEqual(formatTimeAgo(tenDaysAgo), '10d ago');
  });
});
