/**
 * biometricService.ts
 *
 * Client-side helpers for WebAuthn-based student fingerprint enrollment and
 * attendance authentication.  All cryptographic heavy lifting is delegated to
 * Supabase Edge Functions; the browser's Web Authentication API (accessed
 * through @simplewebauthn/browser) handles the actual biometric prompt.
 */

import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { supabase } from './supabase';

const edgeFunctionsBase = (): string => {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  return `${url}/functions/v1`;
};

async function authHeader(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return `Bearer ${session?.access_token ?? ''}`;
}

/**
 * Registers a new WebAuthn credential for `studentId`.
 * Opens the device biometric prompt; throws on failure or cancellation.
 */
export async function registerStudentBiometric(
  studentId: string,
  studentName: string,
): Promise<void> {
  const base = edgeFunctionsBase();
  const authorization = await authHeader();

  // 1. Fetch registration options (challenge) from Edge Function
  const optionsResp = await fetch(
    `${base}/generate-registration-options?studentId=${encodeURIComponent(studentId)}&studentName=${encodeURIComponent(studentName)}`,
    { headers: { Authorization: authorization } },
  );
  if (!optionsResp.ok) {
    throw new Error('Failed to generate registration options');
  }
  const optionsJSON = await optionsResp.json();

  // 2. Trigger the device biometric prompt
  const attestationResponse = await startRegistration({ optionsJSON });

  // 3. Send response to Edge Function for verification + credential storage
  const verifyResp = await fetch(`${base}/verify-registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: JSON.stringify({ studentId, attestationResponse }),
  });
  if (!verifyResp.ok) {
    const body = await verifyResp.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Registration verification failed');
  }
}

/**
 * Authenticates a student via their pre-registered WebAuthn credential.
 * Returns `true` when the biometric matches; `false` if the student has no
 * credential registered or the verification fails.
 * Throws on hard errors (network, cancelled by user, etc.).
 */
export async function authenticateStudentBiometric(
  studentId: string,
): Promise<boolean> {
  const base = edgeFunctionsBase();
  const authorization = await authHeader();

  // 1. Fetch authentication options (challenge + allowed credentials list)
  const optionsResp = await fetch(
    `${base}/generate-authentication-options?studentId=${encodeURIComponent(studentId)}`,
    { headers: { Authorization: authorization } },
  );
  if (optionsResp.status === 404) {
    // Student has no registered credential
    return false;
  }
  if (!optionsResp.ok) {
    throw new Error('Failed to generate authentication options');
  }
  const optionsJSON = await optionsResp.json();

  // 2. Trigger device biometric
  const authenticationResponse = await startAuthentication({ optionsJSON });

  // 3. Verify with Edge Function
  const verifyResp = await fetch(`${base}/verify-authentication`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: JSON.stringify({ studentId, authenticationResponse }),
  });
  if (!verifyResp.ok) return false;
  const result = await verifyResp.json() as { verified?: boolean };
  return result.verified === true;
}
