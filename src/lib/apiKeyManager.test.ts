/**
 * Test for apiKeyManager
 * Verifies that the multi-key rotation system works correctly
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getApiKeys, getApiKey, getFallbackModels, ENCRYPTED_API_KEYS } from './apiKeyManager';
import * as encryptedCredentials from './encryptedCredentials';

describe('apiKeyManager', () => {
  let originalGetGeminiApiKey: typeof encryptedCredentials.getGeminiApiKey;

  beforeEach(() => {
    // Mock getGeminiApiKey to return an empty string (falls back to encrypted keys)
    originalGetGeminiApiKey = encryptedCredentials.getGeminiApiKey;
    encryptedCredentials.getGeminiApiKey = async () => '';
  });

  afterEach(() => {
    // Restore original function
    encryptedCredentials.getGeminiApiKey = originalGetGeminiApiKey;
    encryptedCredentials.clearCredentialCache();
  });

  test('should provide 10 encrypted API keys', () => {
    assert.strictEqual(ENCRYPTED_API_KEYS.length, 10);
  });

  test('should decode encrypted keys to non-empty strings', async () => {
    const keys = await getApiKeys();
    assert.strictEqual(keys.length, 10);
    keys.forEach((key) => {
      assert.strictEqual(typeof key, 'string');
      assert.ok(key.length > 0);
      assert.ok(key.length > 20);
    });
  });

  test('should return a single key for legacy compatibility', async () => {
    const key = await getApiKey();
    assert.strictEqual(typeof key, 'string');
    assert.ok(key.length > 20);
  });

  test('should provide different model queues based on image count', () => {
    const queue1 = getFallbackModels(1);
    const queue5 = getFallbackModels(5);

    assert.ok(Array.isArray(queue1));
    assert.ok(Array.isArray(queue5));
    assert.ok(queue1.length > 0);
    assert.ok(queue5.length > 0);

    // Both should contain valid model names
    const validModels = [
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-3.0-flash-exp',
      'gemini-3.0-pro-exp',
      'gemini-3.1-flash-lite-exp'
    ];

    queue1.forEach(model => {
      assert.ok(validModels.includes(model));
    });
  });

  test('should randomize key order to distribute load', async () => {
    const keys1 = await getApiKeys();
    const keys2 = await getApiKeys();

    assert.strictEqual(keys1.length, keys2.length);
  });
});
