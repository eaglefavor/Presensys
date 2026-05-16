import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { useNetworkStatus } from './useNetworkStatus';
import { renderHook } from '@testing-library/react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const globalWindow = globalThis as unknown as { window: Window; document: Document };
globalWindow.window = dom.window as unknown as Window;
globalWindow.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'node.js' },
  writable: true,
  configurable: true
});

describe('useNetworkStatus', () => {
  type Listener = () => void;
  type Connection = {
    effectiveType: string;
    addEventListener: (event: string, listener: Listener) => void;
    removeEventListener: (event: string, listener: Listener) => void;
  };
  const globalNavigator = globalThis as unknown as { navigator: Navigator & { connection?: Connection } };
  let addEventListenerMock: ReturnType<typeof mock.fn<Connection['addEventListener']>>;
  let removeEventListenerMock: ReturnType<typeof mock.fn<Connection['removeEventListener']>>;
  let listeners: Record<string, Listener[]> = {};

  const setupWindow = (effectiveType = '4g') => {
    listeners = {};

    addEventListenerMock = mock.fn((event: string, callback: Listener) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    });

    removeEventListenerMock = mock.fn((event: string, callback: Listener) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
      }
    });

    globalWindow.window.addEventListener = addEventListenerMock as unknown as Window['addEventListener'];
    globalWindow.window.removeEventListener = removeEventListenerMock as unknown as Window['removeEventListener'];

    Object.defineProperty(globalNavigator.navigator, 'onLine', { value: true, writable: true, configurable: true });

    Object.defineProperty(globalNavigator.navigator, 'connection', {
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
