import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function randomSalt(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
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
    const { studentId, pin } = body;

    if (!studentId || typeof studentId !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid studentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: 'PIN must be exactly 6 digits' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, reg_number, name')
      .eq('user_id', user.id)
      .eq('is_deleted', 0)
      .eq('id', studentId)
      .single();

    if (studentErr || !student) {
      return new Response(JSON.stringify({ error: 'Student not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pinSalt = randomSalt();
    const pinHash = await sha256Hex(`${pin}:${pinSalt}`);

    const { error: upsertErr } = await supabase
      .from('student_pins')
      .upsert({
        student_id: studentId,
        pin_hash: pinHash,
        pin_salt: pinSalt,
        failed_attempts: 0,
        lock_until: null,
        is_deleted: 0,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id,user_id' });

    if (upsertErr) {
      console.error('set-student-pin: upsert failed', upsertErr);
      return new Response(JSON.stringify({ error: 'Failed to set PIN' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('set-student-pin error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
