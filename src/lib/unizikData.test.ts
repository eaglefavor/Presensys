import { test } from 'node:test';
import assert from 'node:assert';
import { getDepartments } from './unizikData.ts';

test('getDepartments returns departments for a valid faculty', () => {
  const departments = getDepartments('Faculty of Agriculture');
  assert.strictEqual(departments.length, 7);
  assert.ok(departments.includes('Animal Science & Technology'));
  assert.ok(departments.includes('Fisheries & Aquaculture'));
});

test('getDepartments returns an empty array for an invalid faculty', () => {
  const departments = getDepartments('Non-existent Faculty');
  assert.ok(Array.isArray(departments));
  assert.strictEqual(departments.length, 0);
});

test('getDepartments returns an empty array for an empty string', () => {
  const departments = getDepartments('');
  assert.ok(Array.isArray(departments));
  assert.strictEqual(departments.length, 0);
});

test('getDepartments returns correct departments for another valid faculty', () => {
  const departments = getDepartments('Faculty of Law');
  assert.strictEqual(departments.length, 4);
  assert.deepStrictEqual(departments, [
    'Civil Law',
    'Commercial Law',
    'International Law',
    'Public Law',
  ]);
});
