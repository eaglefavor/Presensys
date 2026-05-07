/**
 * Edge Function: generate-authentication-options
 *
 * Generates a WebAuthn authentication challenge for a given student.
 * Returns 404 if the student has no registered credential for this user.
 *
 * Query params:
 *   studentId — UUID of the student
 *
 * Returns: PublicKeyCredentialRequestOptionsJSON
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@13';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RP_ID = Deno.env.get('RP_ID')!;

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

    const url = new URL(req.url);
    const studentId = url.searchParams.get('studentId');
    if (!studentId) {
      return new Response(JSON.stringify({ error: 'studentId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up the student's registered credential
    const { data: credRow, error: credErr } = await supabase
      .from('student_credentials')
      .select('credential_id')
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (credErr || !credRow) {
      // Student has no enrolled fingerprint — 404 so the caller can skip gracefully
      return new Response(JSON.stringify({ error: 'No credential registered for this student' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: [
        { id: credRow.credential_id, type: 'public-key' },
      ],
      userVerification: 'required',
    });

    // Store the challenge for verification
    await supabase.from('webauthn_challenges').insert({
      student_id: studentId,
      user_id: user.id,
      challenge: options.challenge,
      type: 'authentication',
    });

    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('generate-authentication-options error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
