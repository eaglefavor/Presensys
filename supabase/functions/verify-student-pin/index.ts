import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_FAILED_ATTEMPTS = 3;
const LOCK_SECONDS = 300;
const GLOBAL_ATTEMPTS_PER_MINUTE = 40;
const STUDENT_ATTEMPTS_PER_MINUTE = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function logAttempt(supabase: ReturnType<typeof createClient>, args: {
  studentId: string;
  sessionId: string;
  userId: string;
  success: boolean;
  reason?: string;
  ipHash?: string;
}) {
  await supabase.from('pin_blitz_attempts').insert({
    student_id: args.studentId,
    session_id: args.sessionId,
    user_id: args.userId,
    success: args.success,
    reason: args.reason ?? null,
    ip_hash: args.ipHash ?? null,
  });
}

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
    const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    if (!sessionId || !studentId || !challengeId || !pin) {
      return new Response(JSON.stringify({ error: 'sessionId, studentId, challengeId, and pin are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientIp = req.headers.get('x-forwarded-for') || '';
    const ipHash = clientIp ? await sha256Hex(`ip:${clientIp}`) : undefined;
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

    const [globalRate, studentRate] = await Promise.all([
      supabase
        .from('pin_blitz_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .gt('created_at', oneMinuteAgo),
      supabase
        .from('pin_blitz_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
        .gt('created_at', oneMinuteAgo),
    ]);

    if ((globalRate.count || 0) >= GLOBAL_ATTEMPTS_PER_MINUTE || (studentRate.count || 0) >= STUDENT_ATTEMPTS_PER_MINUTE) {
      await logAttempt(supabase, {
        studentId,
        sessionId,
        userId: user.id,
        success: false,
        reason: 'rate_limited',
        ipHash,
      });
      return new Response(JSON.stringify({
        verified: false,
        locked: true,
        remainingAttempts: 0,
        retryAfterSeconds: 30,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: challengeRow, error: challengeErr } = await supabase
      .from('pin_blitz_challenges')
      .select('id, challenge, expires_at, consumed_at')
      .eq('id', challengeId)
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (challengeErr || !challengeRow) {
      await logAttempt(supabase, {
        studentId,
        sessionId,
        userId: user.id,
        success: false,
        reason: 'challenge_not_found',
        ipHash,
      });
      return new Response(JSON.stringify({
        verified: false,
        locked: false,
        remainingAttempts: 0,
        retryAfterSeconds: 0,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const now = new Date();
    const isExpired = new Date(challengeRow.expires_at) <= now;
    const isConsumed = !!challengeRow.consumed_at;

    if (isExpired || isConsumed) {
      await logAttempt(supabase, {
        studentId,
        sessionId,
        userId: user.id,
        success: false,
        reason: isExpired ? 'challenge_expired' : 'challenge_consumed',
        ipHash,
      });
      return new Response(JSON.stringify({
        verified: false,
        locked: false,
        remainingAttempts: 0,
        retryAfterSeconds: 0,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('pin_blitz_challenges')
      .update({ consumed_at: now.toISOString() })
      .eq('id', challengeId);

    const { data: pinRow, error: pinErr } = await supabase
      .from('student_pins')
      .select('id, pin_hash, pin_salt, failed_attempts, lock_until')
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .eq('is_deleted', 0)
      .maybeSingle();
    if (pinErr || !pinRow) {
      await logAttempt(supabase, {
        studentId,
        sessionId,
        userId: user.id,
        success: false,
        reason: 'pin_not_found',
        ipHash,
      });
      return new Response(JSON.stringify({
        verified: false,
        locked: false,
        remainingAttempts: 0,
        retryAfterSeconds: 0,
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (pinRow.lock_until && new Date(pinRow.lock_until) > now) {
      const retryAfterSeconds = Math.ceil((new Date(pinRow.lock_until).getTime() - now.getTime()) / 1000);
      await logAttempt(supabase, {
        studentId,
        sessionId,
        userId: user.id,
        success: false,
        reason: 'locked',
        ipHash,
      });
      return new Response(JSON.stringify({
        verified: false,
        locked: true,
        remainingAttempts: 0,
        retryAfterSeconds,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const submittedHash = await sha256Hex(`${pin}:${pinRow.pin_salt}`);
    const verified = submittedHash === pinRow.pin_hash;

    if (verified) {
      await supabase
        .from('student_pins')
        .update({ failed_attempts: 0, lock_until: null, updated_at: now.toISOString() })
        .eq('id', pinRow.id);

      await logAttempt(supabase, {
        studentId,
        sessionId,
        userId: user.id,
        success: true,
        reason: 'verified',
        ipHash,
      });

      return new Response(JSON.stringify({
        verified: true,
        locked: false,
        remainingAttempts: MAX_FAILED_ATTEMPTS,
        retryAfterSeconds: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newFailedAttempts = Number(pinRow.failed_attempts || 0) + 1;
    let retryAfterSeconds = 0;
    let locked = false;
    let remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - newFailedAttempts);

    if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date(now.getTime() + LOCK_SECONDS * 1000).toISOString();
      retryAfterSeconds = LOCK_SECONDS;
      locked = true;
      remainingAttempts = 0;
      await supabase
        .from('student_pins')
        .update({ failed_attempts: 0, lock_until: lockUntil, updated_at: now.toISOString() })
        .eq('id', pinRow.id);
    } else {
      await supabase
        .from('student_pins')
        .update({ failed_attempts: newFailedAttempts, updated_at: now.toISOString() })
        .eq('id', pinRow.id);
    }

    await logAttempt(supabase, {
      studentId,
      sessionId,
      userId: user.id,
      success: false,
      reason: locked ? 'invalid_pin_locked' : 'invalid_pin',
      ipHash,
    });

    return new Response(JSON.stringify({
      verified: false,
      locked,
      remainingAttempts,
      retryAfterSeconds,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('verify-student-pin error', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

