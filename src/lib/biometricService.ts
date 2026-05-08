import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { db } from '../db/db';
import type { LocalStudent } from '../db/db';
import { supabase, supabaseUrl } from './supabase';

// ─── Error Taxonomy ───────────────────────────────────────────────────────────

export type FingerprintErrorCode =
  | 'UNSUPPORTED'          // browser / device does not support WebAuthn
  | 'INSECURE_CONTEXT'     // page served over plain HTTP outside localhost
  | 'NOT_ALLOWED'          // user canceled the prompt or sensor timed out
  | 'CREDENTIAL_NOT_FOUND' // no enrolled credential for this student
  | 'CHALLENGE_EXPIRED'    // server challenge TTL elapsed before ceremony finished
  | 'RP_MISMATCH'          // rpID / origin does not match server expectation
  | 'VERIFICATION_FAILED'  // server returned verified=false
  | 'NETWORK_ERROR'        // fetch failed due to connectivity / server error
  | 'OFFLINE'              // navigator.onLine is false
  | 'UNKNOWN';             // catch-all for unexpected errors

/**
 * Structured error thrown by every biometricService function.
 * Callers should inspect `code` for machine-readable handling and
 * `retriable` to decide whether to offer a retry button.
 */
export class FingerprintError extends Error {
  constructor(
    public readonly code: FingerprintErrorCode,
    message: string,
    /** True when retrying the same operation is safe and likely to succeed. */
    public readonly retriable: boolean,
  ) {
    super(message);
    this.name = 'FingerprintError';
  }
}

// ─── Observability ────────────────────────────────────────────────────────────

function fpLog(stage: string, extra?: Record<string, unknown>): void {
  console.log('[Fingerprint]', JSON.stringify({ stage, ts: Date.now(), ...extra }));
}

// ─── Support check ────────────────────────────────────────────────────────────

/**
 * Non-throwing capability probe.  UI uses this to decide whether to show
 * the fingerprint option and what hint to display.
 */
export function checkFingerprintSupport(): { supported: boolean; reason?: string } {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return { supported: false, reason: 'WebAuthn is not supported on this device or browser.' };
  }
  const { protocol, hostname } = window.location;
  if (protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return { supported: false, reason: 'Fingerprint requires a secure connection (HTTPS).' };
  }
  return { supported: true };
}

function assertPrerequisites(): void {
  const { supported, reason } = checkFingerprintSupport();
  if (!supported) {
    throw new FingerprintError('UNSUPPORTED', reason ?? 'WebAuthn is not supported.', false);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    throw new FingerprintError('UNKNOWN', 'Session expired. Please log in again.', false);
  }
  return `Bearer ${session.access_token}`;
}

const EDGE_FN_BASE = `${supabaseUrl}/functions/v1`;

async function edgeGet(path: string, authorization: string): Promise<Response> {
  try {
    return await fetch(`${EDGE_FN_BASE}/${path}`, {
      method: 'GET',
      headers: { Authorization: authorization },
    });
  } catch (err) {
    fpLog('fetch-error', { path, err: String(err) });
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new FingerprintError('OFFLINE', 'No internet connection. Use manual attendance instead.', false);
    }
    throw new FingerprintError('NETWORK_ERROR', 'Network error. Please check your connection and try again.', true);
  }
}

async function edgePost(path: string, authorization: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${EDGE_FN_BASE}/${path}`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    fpLog('fetch-error', { path, err: String(err) });
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new FingerprintError('OFFLINE', 'No internet connection. Use manual attendance instead.', false);
    }
    throw new FingerprintError('NETWORK_ERROR', 'Network error. Please check your connection and try again.', true);
  }
}

function mapEdgeError(status: number, body: Record<string, unknown>, phase: string): FingerprintError {
  const msg = typeof body.error === 'string' ? body.error : 'Unexpected server error.';
  fpLog(`${phase}:edge-error`, { status, msg });
  if (status === 401) return new FingerprintError('UNKNOWN', 'Session expired. Please log in again.', false);
  if (status === 404) return new FingerprintError('CREDENTIAL_NOT_FOUND', 'No fingerprint registered for this student.', false);
  const lmsg = msg.toLowerCase();
  if (lmsg.includes('challenge')) return new FingerprintError('CHALLENGE_EXPIRED', 'Challenge expired. Please retry.', true);
  if (lmsg.includes('rp') || lmsg.includes('origin')) return new FingerprintError('RP_MISMATCH', 'Domain mismatch error — contact support.', false);
  if (status >= 500) return new FingerprintError('NETWORK_ERROR', 'Server error. Please try again shortly.', true);
  return new FingerprintError('VERIFICATION_FAILED', msg, false);
}

function mapBrowserError(err: unknown, phase: 'register' | 'authenticate'): FingerprintError {
  const msg = err instanceof Error ? err.message : String(err);
  fpLog(`${phase}:browser-error`, { msg });
  // NotAllowedError: user canceled, sensor timeout, or biometrics not enrolled on device
  if (msg.includes('NotAllowedError') || msg.includes('not allowed') || msg.includes('cancelled') || msg.includes('canceled')) {
    return new FingerprintError('NOT_ALLOWED', 'Authentication was cancelled or timed out. Please try again.', true);
  }
  // InvalidStateError: credential already exists on authenticator
  if (msg.includes('InvalidStateError') || msg.includes('already registered')) {
    return new FingerprintError('VERIFICATION_FAILED', 'This fingerprint is already registered on the device.', false);
  }
  return new FingerprintError('UNKNOWN', msg || 'An unexpected error occurred.', true);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registers a student's fingerprint via a server-side WebAuthn challenge.
 *
 * Architecture: challenge generation and response verification are both
 * performed by Supabase edge functions.  No @simplewebauthn/server code
 * runs in the browser.  The local Dexie `studentCredentials` table is updated
 * by the sync engine on the next pull cycle.
 *
 * @throws {FingerprintError} on any failure — inspect `code` and `retriable`.
 */
export async function registerStudentFingerprint(student: LocalStudent, _userId: string): Promise<void> {
  assertPrerequisites();
  fpLog('register:start', { studentId: student.serverId });

  const auth = await getAuthHeader();

  // 1. Fetch registration challenge from the server
  const optRes = await edgeGet(
    `generate-registration-options?studentId=${encodeURIComponent(student.serverId)}&studentName=${encodeURIComponent(student.name)}`,
    auth,
  );
  if (!optRes.ok) {
    throw mapEdgeError(optRes.status, await optRes.json().catch(() => ({})), 'register:options');
  }
  const optionsJSON = await optRes.json();
  fpLog('register:options-received', { studentId: student.serverId });

  // 2. Run the browser biometric ceremony
  let attestation;
  try {
    attestation = await startRegistration({ optionsJSON });
  } catch (err) {
    throw mapBrowserError(err, 'register');
  }
  fpLog('register:attestation-received', { studentId: student.serverId });

  // 3. Verify registration on the server
  const verRes = await edgePost('verify-registration', auth, {
    studentId: student.serverId,
    attestationResponse: attestation,
  });
  if (!verRes.ok) {
    throw mapEdgeError(verRes.status, await verRes.json().catch(() => ({})), 'register:verify');
  }
  const { verified } = await verRes.json();
  if (!verified) {
    throw new FingerprintError('VERIFICATION_FAILED', 'Registration verification failed. Please try again.', true);
  }

  fpLog('register:success', { studentId: student.serverId });
  // The sync engine will pull the new credential from the server on its next
  // cycle and update the local Dexie cache automatically.
}

/**
 * Verifies a student's fingerprint via a server-side WebAuthn challenge.
 *
 * @throws {FingerprintError} on any failure — inspect `code` and `retriable`.
 */
export async function verifyStudentFingerprint(student: LocalStudent): Promise<void> {
  assertPrerequisites();

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new FingerprintError('OFFLINE', 'No internet connection. Use manual attendance instead.', false);
  }

  fpLog('verify:start', { studentId: student.serverId });
  const auth = await getAuthHeader();

  // 1. Fetch authentication challenge from the server
  const optRes = await edgeGet(
    `generate-authentication-options?studentId=${encodeURIComponent(student.serverId)}`,
    auth,
  );
  if (optRes.status === 404) {
    fpLog('verify:no-credential', { studentId: student.serverId });
    throw new FingerprintError('CREDENTIAL_NOT_FOUND', 'No fingerprint registered for this student.', false);
  }
  if (!optRes.ok) {
    throw mapEdgeError(optRes.status, await optRes.json().catch(() => ({})), 'verify:options');
  }
  const optionsJSON = await optRes.json();
  fpLog('verify:options-received', { studentId: student.serverId });

  // 2. Run the browser biometric ceremony
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON });
  } catch (err) {
    throw mapBrowserError(err, 'authenticate');
  }
  fpLog('verify:response-received', { studentId: student.serverId });

  // 3. Verify assertion on the server
  const verRes = await edgePost('verify-authentication', auth, {
    studentId: student.serverId,
    authenticationResponse: assertion,
  });
  if (!verRes.ok) {
    throw mapEdgeError(verRes.status, await verRes.json().catch(() => ({})), 'verify:check');
  }
  const { verified } = await verRes.json();
  if (!verified) {
    throw new FingerprintError('VERIFICATION_FAILED', 'Fingerprint not recognized. Please try again.', true);
  }

  fpLog('verify:success', { studentId: student.serverId });
}

/**
 * Returns true when the student has at least one non-deleted credential in the
 * local Dexie cache.  The cache is kept in sync with the server by the
 * RealtimeSyncEngine.
 */
export async function hasRegisteredFingerprint(studentId: string): Promise<boolean> {
  const count = await db.studentCredentials
    .where('studentId').equals(studentId)
    .filter(c => c.isDeleted === 0)
    .count();
  return count > 0;
}
