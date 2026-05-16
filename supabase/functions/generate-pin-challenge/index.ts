import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHALLENGE_TTL_SECONDS = 120;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    const studentId = typeof body?.studentId === 'string' ? body.studentId : '';
    if (!sessionId || !studentId) {
      return new Response(JSON.stringify({ error: 'sessionId and studentId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sessionRow, error: sessionErr } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('is_deleted', 0)
      .maybeSingle();
    if (sessionErr || !sessionRow) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pinRow, error: pinErr } = await supabase
      .from('student_pins')
      .select('id, lock_until')
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .eq('is_deleted', 0)
      .maybeSingle();
    if (pinErr || !pinRow) {
      return new Response(JSON.stringify({ error: 'No PIN assigned for this student' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    if (pinRow.lock_until && new Date(pinRow.lock_until) > now) {
      const retryAfterSeconds = Math.ceil((new Date(pinRow.lock_until).getTime() - now.getTime()) / 1000);
      return new Response(JSON.stringify({
        challengeId: null,
        locked: true,
        retryAfterSeconds,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
    const challenge = crypto.randomUUID();
    const { data: challengeRow, error: challengeErr } = await supabase
      .from('pin_blitz_challenges')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        challenge,
        expires_at: expiresAt,
        user_id: user.id,
      })
      .select('id')
      .single();

    if (challengeErr || !challengeRow) {
      console.error('generate-pin-challenge insert error', challengeErr);
      return new Response(JSON.stringify({ error: 'Failed to create challenge' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ challengeId: challengeRow.id, locked: false, retryAfterSeconds: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('generate-pin-challenge error', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

