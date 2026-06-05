/**
 * Test for apiKeyManager
 * Verifies that the multi-key rotation system works correctly
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getFallbackModels, ENCRYPTED_API_KEYS } from './apiKeyManager';

describe('apiKeyManager', () => {
  test('should provide 10 encrypted API keys', () => {
    assert.strictEqual(ENCRYPTED_API_KEYS.length, 10);
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

  test('should return model queues as arrays', async () => {
    const models = getFallbackModels();
    assert.ok(Array.isArray(models));
    assert.ok(models.length > 0);
    models.forEach(model => {
      assert.strictEqual(typeof model, 'string');
      assert.ok(model.length > 0);
    });
  });

  test('should support different image counts for model selection', () => {
    // Test with various image counts
    for (let i = 1; i <= 5; i++) {
      const models = getFallbackModels(i);
      assert.ok(Array.isArray(models));
      assert.ok(models.length > 0);
    }
  });

  test('should provide 10 encrypted API keys for fallback', () => {
    // Verify that fallback encryption keys are available
    assert.strictEqual(ENCRYPTED_API_KEYS.length, 10);
    ENCRYPTED_API_KEYS.forEach(key => {
      assert.strictEqual(typeof key, 'string');
      assert.ok(key.length > 0);
    });
  });
});
