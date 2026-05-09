/**
 * Edge Function: generate-registration-options
 *
 * Generates a WebAuthn registration challenge for a given student and stores
 * it temporarily in webauthn_challenges.
 *
 * Query params:
 *   studentId   — UUID of the student (students.id)
 *   studentName — Display name for the credential (for authenticator UX)
 *
 * Returns: PublicKeyCredentialCreationOptionsJSON
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@13';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RP_NAME = Deno.env.get('RP_NAME') ?? 'Presensys';
const RP_ID = Deno.env.get('RP_ID')!; // e.g. presensys.app

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function readJsonBody(req: Request): Promise<{ body: Record<string, unknown>; malformed: boolean }> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return { body: body as Record<string, unknown>, malformed: false };
    }
    return { body: {}, malformed: true };
  } catch (err) {
    console.warn('generate-registration-options: invalid JSON body', err);
    return { body: {}, malformed: true };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the calling user via the JWT in the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await userClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const parsedBody = req.method === 'POST'
      ? await readJsonBody(req)
      : { body: {}, malformed: false };
    if (parsedBody.malformed) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = parsedBody.body;
    const studentId = url.searchParams.get('studentId')
      ?? (typeof body.studentId === 'string' ? body.studentId : null);
    const studentName = url.searchParams.get('studentName')
      ?? (typeof body.studentName === 'string' ? body.studentName : 'Student');

    if (!studentId) {
      return new Response(JSON.stringify({ error: 'studentId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if the student already has a credential for this user; if so, we
    // will overwrite it during verify-registration.
    const { data: existing } = await supabase
      .from('student_credentials')
      .select('credential_id')
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .maybeSingle();

    const excludeCredentials = existing
      ? [{ id: existing.credential_id, type: 'public-key' as const }]
      : [];

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      // Use the studentId as the user handle so the authenticator stores a
      // unique key per student (not per device owner).
      userID: new TextEncoder().encode(studentId),
      userName: studentName,
      userDisplayName: studentName,
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });

    // Persist the challenge so verify-registration can check it
    const { error: challengeErr } = await supabase.from('webauthn_challenges').insert({
      student_id: studentId,
      user_id: user.id,
      challenge: options.challenge,
      type: 'registration',
    });
    if (challengeErr) {
      console.error('generate-registration-options: challenge insert error', challengeErr);
      return new Response(JSON.stringify({ error: 'Failed to store challenge' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('generate-registration-options error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
