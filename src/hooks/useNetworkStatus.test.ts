import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { useNetworkStatus } from './useNetworkStatus';
import { renderHook } from '@testing-library/react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'node.js' },
  writable: true,
  configurable: true
});

describe('useNetworkStatus', () => {
  let addEventListenerMock: any;
  let removeEventListenerMock: any;
  let listeners: Record<string, Function[]> = {};

  const setupWindow = (effectiveType = '4g') => {
    listeners = {};

    addEventListenerMock = mock.fn((event: string, callback: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    });

    removeEventListenerMock = mock.fn((event: string, callback: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
      }
    });

    (global as any).window.addEventListener = addEventListenerMock;
    (global as any).window.removeEventListener = removeEventListenerMock;

    Object.defineProperty((global as any).navigator, 'onLine', { value: true, writable: true, configurable: true });

    Object.defineProperty((global as any).navigator, 'connection', {
      value: {
        effectiveType: effectiveType,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock
      },
      writable: true,
      configurable: true
    });
  };

  afterEach(() => {
    mock.timers.reset();
  });

  it('detects online status properly', () => {
    setupWindow('4g');

    const { result } = renderHook(() => useNetworkStatus());

    assert.strictEqual(result.current.isOnline, true);
    assert.strictEqual(result.current.isSlow, false);
  });

  it('detects slow network when initialized with 2g', () => {
    setupWindow('2g');

    const { result } = renderHook(() => useNetworkStatus());

    assert.strictEqual(result.current.isOnline, true);
    assert.strictEqual(result.current.isSlow, true);
  });
});
