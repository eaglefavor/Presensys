import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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
    const forceReset = body?.forceReset === true;
    const studentIds = Array.isArray(body?.studentIds) ? body.studentIds.filter((id: unknown) => typeof id === 'string') : [];

    if (!studentIds.length || studentIds.length > 500) {
      return new Response(JSON.stringify({ error: 'studentIds must be a non-empty array up to 500 items' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: students, error: studentErr } = await supabase
      .from('students')
      .select('id, reg_number, name')
      .eq('user_id', user.id)
      .eq('is_deleted', 0)
      .in('id', studentIds);
    if (studentErr) {
      return new Response(JSON.stringify({ error: 'Failed to fetch students' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const studentMap = new Map((students || []).map(s => [s.id, s]));
    const validStudentIds = Array.from(studentMap.keys());
    if (!validStudentIds.length) {
      return new Response(JSON.stringify({ createdPins: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingPins, error: pinErr } = await supabase
      .from('student_pins')
      .select('id, student_id')
      .eq('user_id', user.id)
      .in('student_id', validStudentIds);
    if (pinErr) {
      return new Response(JSON.stringify({ error: 'Failed to fetch existing PIN records' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingSet = new Set((existingPins || []).map(p => p.student_id));
    const createdPins: Array<{ studentId: string; regNumber: string; name: string; pin: string }> = [];

    for (const studentId of validStudentIds) {
      if (!forceReset && existingSet.has(studentId)) continue;
      const student = studentMap.get(studentId);
      if (!student) continue;

      const pin = randomPin();
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
        console.error('ensure-student-pins: upsert failed', upsertErr);
        continue;
      }

      createdPins.push({
        studentId,
        regNumber: student.reg_number,
        name: student.name,
        pin,
      });
    }

    return new Response(JSON.stringify({ createdPins }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ensure-student-pins error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

