#!/usr/bin/env node
/**
 * Presensys Fingerprint Bridge — Termux / Node.js WebSocket server
 *
 * Runs on the course rep's Android device inside Termux.
 * Tails the Android system log (logcat) for BiometricService HAL authentication
 * events and broadcasts the captured fingerprint ID to all connected WebSocket
 * clients (i.e. the Presensys web app running on the same device).
 *
 * Usage (inside Termux):
 *   node fingerprint-bridge.js
 *
 * Prerequisites:
 *   pkg install nodejs
 *   npm install ws        # or: npm install -g ws
 *
 * The Presensys frontend connects to ws://localhost:8080 automatically.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';

const PORT = 8080;

// ── WebSocket server ──────────────────────────────────────────────────────────

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('[bridge] Client connected');
  clients.add(ws);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[bridge] Client disconnected');
  });
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] WebSocket server listening on ws://localhost:${PORT}`);
  console.log('[bridge] Waiting for fingerprint events from logcat…');
  startLogcat();
});

// ── Logcat tail ───────────────────────────────────────────────────────────────

/**
 * Pattern examples from Android BiometricService / vendor HAL logs:
 *   BiometricService: Authenticated fingerId=3, groupId=0
 *   fingerprint_hal: onAuthenticated(fid=5, gid=0)
 *   FingerprintService: onAuthenticated(identifier=2, ...)
 *
 * We capture any numeric ID following common keyword patterns.
 */
const FP_PATTERNS = [
  /(?:Authenticated|onAuthenticated)[^(]*(?:\(fid=|fingerId=|identifier=)(\d+)/i,
  /fingerId=(\d+)/i,
  /fid=(\d+)/i,
];

function startLogcat() {
  // -s filter to reduce noise; fallback to broader match if vendor tags differ
  const logcat = spawn('logcat', [
    '-s',
    'BiometricService:D',
    'FingerprintService:D',
    'fingerprint_hal:D',
    '*:S', // silence everything else
  ]);

  logcat.stdout.setEncoding('utf8');

  let buffer = '';
  logcat.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete last line

    for (const line of lines) {
      const fingerId = parseFingerprintId(line);
      if (fingerId !== null) {
        console.log(`[bridge] Fingerprint detected: fingerId=${fingerId}`);
        broadcast({ type: 'fingerprint', fingerId: String(fingerId) });
      }
    }
  });

  logcat.stderr.setEncoding('utf8');
  logcat.stderr.on('data', (data) => {
    console.error('[bridge] logcat stderr:', data.trim());
  });

  logcat.on('close', (code) => {
    console.warn(`[bridge] logcat exited (code=${code}), restarting in 3s…`);
    setTimeout(startLogcat, 3000);
  });

  logcat.on('error', (err) => {
    console.error('[bridge] Failed to spawn logcat:', err.message);
    console.error('[bridge] Ensure ADB / logcat is available in Termux ($PATH).');
  });
}

function parseFingerprintId(line) {
  for (const pattern of FP_PATTERNS) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return null;
}
