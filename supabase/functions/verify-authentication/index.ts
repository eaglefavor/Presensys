/**
 * Edge Function: verify-authentication
 *
 * Verifies a WebAuthn authentication response for a student and updates the
 * credential counter in student_credentials.
 *
 * Body (JSON):
 *   studentId               — UUID of the student
 *   authenticationResponse  — AuthenticationResponseJSON from @simplewebauthn/browser
 *
 * Returns: { verified: true } on success.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@13';
import type { AuthenticatorTransportFuture } from 'npm:@simplewebauthn/server@13';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RP_ID = Deno.env.get('RP_ID')!;
const ORIGIN = Deno.env.get('ORIGIN')!;

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

    const { studentId, authenticationResponse } = await req.json();
    if (!studentId || !authenticationResponse) {
      return new Response(JSON.stringify({ error: 'studentId and authenticationResponse are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch stored credential
    const { data: credRow, error: credErr } = await supabase
      .from('student_credentials')
      .select('id, credential_id, public_key, counter')
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (credErr || !credRow) {
      return new Response(JSON.stringify({ error: 'No credential registered for this student' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the most recent valid challenge
    const { data: challengeRow, error: challengeErr } = await supabase
      .from('webauthn_challenges')
      .select('id, challenge')
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .eq('type', 'authentication')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (challengeErr || !challengeRow) {
      return new Response(JSON.stringify({ error: 'No valid challenge found. Please retry.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decode stored base64url public key back to Uint8Array
    const b64 = credRow.public_key.replace(/-/g, '+').replace(/_/g, '/');
    const publicKeyBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: credRow.credential_id,
        publicKey: publicKeyBytes,
        counter: credRow.counter,
        transports: authenticationResponse.response?.transports as AuthenticatorTransportFuture[] | undefined,
      },
    });

    // Consume the challenge regardless of outcome
    await supabase.from('webauthn_challenges').delete().eq('id', challengeRow.id);

    if (!verification.verified) {
      return new Response(JSON.stringify({ verified: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update the credential counter to prevent replay attacks
    const newCounter = verification.authenticationInfo.newCounter;
    await supabase
      .from('student_credentials')
      .update({ counter: newCounter })
      .eq('id', credRow.id);

    return new Response(JSON.stringify({ verified: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('verify-authentication error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
