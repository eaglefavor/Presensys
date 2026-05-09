import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { db } from '../db/db';
import type { LocalStudent } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

const rpName = 'Presensys Fingerprint Blitz';
const rpID = window.location.hostname;
const origin = window.location.origin;

// Helper to convert string to Uint8Array
const encoder = new TextEncoder();

export async function registerStudentFingerprint(student: LocalStudent, userId: string) {
  const optionsJSON = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: encoder.encode(student.serverId),
    userName: student.regNumber,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  });

  const attestationResponse = await startRegistration({ optionsJSON });

  const verification = await verifyRegistrationResponse({
    response: attestationResponse,
    expectedChallenge: optionsJSON.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (verification.verified && verification.registrationInfo) {
    const { credential } = verification.registrationInfo;

    const existing = await db.studentCredentials.where('studentId').equals(student.serverId).first();
    if (existing) {
       await db.studentCredentials.update(existing.id!, { isDeleted: 1, synced: 0 });
    }

    const credentialIdStr = credential.id;
    const publicKeyStr = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(credential.publicKey)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    await db.studentCredentials.add({
      serverId: uuidv4(),
      studentId: student.serverId,
      credentialId: credentialIdStr,
      publicKey: publicKeyStr,
      counter: verification.registrationInfo.credential.counter || 0,
      synced: 0,
      isDeleted: 0,
      userId
    });

    return true;
  }

  throw new Error("Fingerprint registration verification failed.");
}

export async function verifyStudentFingerprint(student: LocalStudent) {
  const cred = await db.studentCredentials.where('studentId').equals(student.serverId).filter(c => c.isDeleted === 0).first();
  if (!cred) {
    throw new Error("Student has no registered fingerprint.");
  }

  const base64ToUint8Array = (base64url: string) => {
      const padding = '='.repeat((4 - base64url.length % 4) % 4);
      const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
  };

  const credentialPublicKey = base64ToUint8Array(cred.publicKey);
  const credentialIdBase64url = cred.credentialId;

  const optionsJSON = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{
      id: credentialIdBase64url,
      transports: ['internal'],
    }],
    userVerification: 'required',
  });

  const assertionResponse = await startAuthentication({ optionsJSON });

  const verification = await verifyAuthenticationResponse({
    response: assertionResponse,
    expectedChallenge: optionsJSON.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credentialIdBase64url,
      publicKey: credentialPublicKey,
      counter: cred.counter,
      transports: ['internal']
    },
    requireUserVerification: true,
  });

  if (verification.verified && verification.authenticationInfo) {
    const { newCounter } = verification.authenticationInfo;

    await db.studentCredentials.update(cred.id!, {
      counter: newCounter,
      synced: 0
    });

    return true;
  }

  throw new Error("Fingerprint verification failed.");
}

export async function hasRegisteredFingerprint(studentId: string) {
    const count = await db.studentCredentials.where('studentId').equals(studentId).filter(c => c.isDeleted === 0).count();
    return count > 0;
}
