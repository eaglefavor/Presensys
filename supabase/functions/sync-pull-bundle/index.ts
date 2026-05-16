import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    const { cursors, userId } = await req.json();

    if (userId !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const tableNames = [
      'semesters', 'students', 'courses', 'enrollments', 'attendance_sessions',
      'lecturers', 'attendance_records', 'course_schedules', 'student_credentials'
    ];

    const results: Record<string, unknown[]> = {};
    const promises = [];

    for (const tableName of tableNames) {
      const cursor = cursors[tableName];
      const isFreshSync = cursor === new Date(0).toISOString();

      let query = supabase
        .from(tableName)
        .select('*')
        .eq('user_id', userId)
        .gt('updated_at', cursor)
        .order('updated_at', { ascending: true })
        .limit(1000); // Add a reasonable limit per table

      if (isFreshSync) {
        query = query.eq('is_deleted', 0);
      }

      promises.push(
        query.then(({ data, error }) => {
          if (error) {
            console.error(`Error pulling ${tableName}`, error);
            results[tableName] = [];
          } else {
            results[tableName] = data || [];
          }
        })
      );
    }

    await Promise.all(promises);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('sync-pull-bundle error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
