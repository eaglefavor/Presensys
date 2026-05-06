import { useState, useEffect, useRef } from 'react';

export interface FingerprintBridgeState {
  connected: boolean;
}

const RECONNECT_DELAY_MS = 5000;

/**
 * Manages a WebSocket connection to the local fingerprint bridge daemon
 * running on the course rep's Android device (via Termux).
 *
 * The caller provides an `onEvent` callback that is invoked whenever a
 * fingerprint ID is received.  Using a callback instead of exposing the event
 * as state avoids calling setState inside an effect in the consumer component.
 *
 * `bridgeUrl` — the WebSocket URL of the bridge (e.g. ws://localhost:8080).
 *   Changing this value reconnects to the new address.
 *
 * Exposes:
 *  - `connected` — true when the WebSocket is open
 */
export function useFingerprintBridge(
  onEvent: (fingerId: string) => void,
  bridgeUrl: string,
): FingerprintBridgeState {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  // Keep a stable ref to onEvent so we never need to restart the connection
  // when the callback identity changes (e.g. due to parent re-renders).
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    mountedRef.current = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!mountedRef.current) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

      try {
        const ws = new WebSocket(bridgeUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) { ws.close(); return; }
          setConnected(true);
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(event.data as string);
            if (data?.type === 'fingerprint' && data?.fingerId) {
              onEventRef.current(String(data.fingerId));
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onerror = () => {
          // onerror is always followed by onclose; cleanup happens there
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setConnected(false);
          wsRef.current = null;
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        };
      } catch {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [bridgeUrl]); // reconnect whenever the target URL changes
  // Note: onEvent is intentionally excluded — its latest value is always
  // available via onEventRef.current (kept current by the effect above), so
  // adding it here would cause unnecessary WebSocket reconnects.

  return { connected };
}
