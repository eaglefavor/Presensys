/**
 * Edge Function: verify-registration
 *
 * Verifies a WebAuthn registration response and stores the resulting
 * credential in student_credentials.
 *
 * Body (JSON):
 *   studentId           — UUID of the student
 *   attestationResponse — RegistrationResponseJSON from @simplewebauthn/browser
 *
 * Returns: { verified: true } on success.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@13';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RP_ID = Deno.env.get('RP_ID')!;
const ORIGIN = Deno.env.get('ORIGIN')!; // e.g. https://presensys.app

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { studentId, attestationResponse } = await req.json();
    if (!studentId || !attestationResponse) {
      return new Response(JSON.stringify({ error: 'studentId and attestationResponse are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the most recent valid challenge for this student + user
    const { data: challengeRow, error: challengeErr } = await supabase
      .from('webauthn_challenges')
      .select('id, challenge')
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .eq('type', 'registration')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (challengeErr || !challengeRow) {
      return new Response(JSON.stringify({ error: 'No valid challenge found. Please restart enrollment.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    // Consume the challenge regardless of outcome
    await supabase.from('webauthn_challenges').delete().eq('id', challengeRow.id);

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { credential } = verification.registrationInfo;

    // Encode the public key (Uint8Array) to base64url for storage
    const publicKeyB64 = btoa(String.fromCharCode(...credential.publicKey))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Upsert: replace any existing credential for this student + user pair
    const { error: upsertErr } = await supabase
      .from('student_credentials')
      .upsert(
        {
          student_id: studentId,
          user_id: user.id,
          credential_id: credential.id,
          public_key: publicKeyB64,
          counter: credential.counter,
        },
        { onConflict: 'student_id,user_id' },
      );

    if (upsertErr) {
      console.error('verify-registration: upsert error', upsertErr);
      return new Response(JSON.stringify({ error: 'Failed to save credential' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ verified: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('verify-registration error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
