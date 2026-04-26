import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { shareData } from './ExportUtils.ts';

describe('shareData', () => {
  let originalNavigator: any;

  beforeEach(() => {
    originalNavigator = global.navigator;
    // We can redefine property 'navigator' on global to mock it
    Object.defineProperty(global, 'navigator', {
      value: {
        share: undefined,
        clipboard: {
            writeText: undefined
        }
      },
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true
    });
  });

  test('returns true when navigator.share succeeds', async () => {
    let shared = false;
    // @ts-ignore
    global.navigator.share = async (data) => {
      shared = true;
      assert.strictEqual(data.title, 'Test Title');
      assert.strictEqual(data.text, 'Test Text');
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, true);
    assert.strictEqual(shared, true);
  });

  test('returns false when navigator.share throws AbortError (user cancelled)', async () => {
    // @ts-ignore
    global.navigator.share = async () => {
      const error = new Error('User cancelled');
      error.name = 'AbortError';
      throw error;
    };

    let clipboardCalled = false;
    // @ts-ignore
    global.navigator.clipboard = {
      writeText: async () => {
        clipboardCalled = true;
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, false);
    assert.strictEqual(clipboardCalled, false, 'Should not fallback to clipboard on AbortError');
  });

  test('falls back to clipboard when navigator.share is undefined', async () => {
    // navigator.share is undefined from beforeEach
    let clipboardText = '';
    // @ts-ignore
    global.navigator.clipboard = {
      writeText: async (text: string) => {
        clipboardText = text;
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, true);
    assert.strictEqual(clipboardText, 'Test Text');
  });

  test('falls back to clipboard when navigator.share throws non-AbortError', async () => {
    // @ts-ignore
    global.navigator.share = async () => {
      throw new Error('NotSupportedError');
    };

    let clipboardText = '';
    // @ts-ignore
    global.navigator.clipboard = {
      writeText: async (text: string) => {
        clipboardText = text;
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, true);
    assert.strictEqual(clipboardText, 'Test Text');
  });

  test('returns false when both navigator.share and clipboard.writeText fail', async () => {
    // @ts-ignore
    global.navigator.share = async () => {
      throw new Error('NotSupportedError');
    };

    // @ts-ignore
    global.navigator.clipboard = {
      writeText: async () => {
        throw new Error('Clipboard denied');
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, false);
  });
});
