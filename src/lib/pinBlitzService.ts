import { supabase } from './supabase';

export interface StudentPinReveal {
  studentId: string;
  regNumber: string;
  name: string;
  pin: string;
}

export interface VerifyPinResult {
  verified: boolean;
  locked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export async function ensureStudentPins(studentIds: string[]): Promise<StudentPinReveal[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase.functions.invoke('ensure-student-pins', {
    body: { studentIds },
  });
  if (error) {
    throw new Error(error.message || 'Failed to provision student PINs');
  }
  return (data?.createdPins || []) as StudentPinReveal[];
}

export async function assignOrResetStudentPin(studentId: string): Promise<StudentPinReveal> {
  const { data, error } = await supabase.functions.invoke('ensure-student-pins', {
    body: { studentIds: [studentId], forceReset: true },
  });
  if (error) {
    throw new Error(error.message || 'Failed to reset student PIN');
  }

  const createdPins = (data?.createdPins || []) as StudentPinReveal[];
  if (!createdPins.length) {
    throw new Error('PIN reset did not return a generated PIN');
  }
  return createdPins[0];
}

export async function generatePinChallenge(sessionId: string, studentId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-pin-challenge', {
    body: { sessionId, studentId },
  });
  if (error) {
    throw new Error(error.message || 'Failed to create PIN challenge');
  }
  if (!data?.challengeId) {
    throw new Error('PIN challenge missing challengeId');
  }
  return data.challengeId as string;
}

export async function verifyStudentPin(input: {
  sessionId: string;
  studentId: string;
  challengeId: string;
  pin: string;
}): Promise<VerifyPinResult> {
  const { data, error } = await supabase.functions.invoke('verify-student-pin', {
    body: input,
  });
  if (error) {
    throw new Error(error.message || 'PIN verification failed');
  }
  return {
    verified: !!data?.verified,
    locked: !!data?.locked,
    remainingAttempts: Number(data?.remainingAttempts ?? 0),
    retryAfterSeconds: Number(data?.retryAfterSeconds ?? 0),
  };
}
