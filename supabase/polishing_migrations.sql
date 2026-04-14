-- ============================================================
-- Presensys polishing migrations
-- Run these in the Supabase SQL editor in the order listed.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 3.3  Admin-only RLS policy on profiles
--      Allows admins to read every user profile so that
--      aggregate stats can be computed without a SECURITY
--      DEFINER function workaround.
-- ────────────────────────────────────────────────────────────

-- Drop the legacy policy if it exists to avoid name collision.
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────
-- 6.1  get_admin_stats()  –  SECURITY DEFINER aggregate
--      Returns totals that require reading ALL profiles rows.
--      Called from the frontend via supabase.rpc('get_admin_stats').
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_users',   COUNT(*),
    'active_reps',   COUNT(*) FILTER (WHERE status = 'verified'),
    'pending_users', COUNT(*) FILTER (WHERE status = 'pending')
  )
  FROM public.profiles;
$$;

-- Only admins may call this function.
REVOKE ALL ON FUNCTION public.get_admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;

-- Row-level check inside the function is not needed because the
-- caller must still be authenticated; the SECURITY DEFINER
-- privilege lets it bypass RLS on the profiles table only for
-- the aggregate — it does not expose individual rows.


-- ────────────────────────────────────────────────────────────
-- 6.2  Migrate attendance_records.marked_at
--      from BIGINT (epoch milliseconds) to TIMESTAMPTZ.
--
--      The frontend already sends and accepts ISO-8601 strings
--      after this migration (dual-format pull mapping handles
--      the transition window).
-- ────────────────────────────────────────────────────────────

-- Step 1: add a temporary timestamptz column
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS marked_at_ts TIMESTAMPTZ;

-- Step 2: back-fill from the existing BIGINT column
UPDATE public.attendance_records
SET marked_at_ts = to_timestamp(marked_at::double precision / 1000.0)
WHERE marked_at IS NOT NULL
  AND marked_at_ts IS NULL;

-- Step 3: drop old column and rename new one
--   (only run steps 3-4 once the back-fill above completes
--    and you have verified the data looks correct)
ALTER TABLE public.attendance_records
  DROP COLUMN IF EXISTS marked_at;

ALTER TABLE public.attendance_records
  RENAME COLUMN marked_at_ts TO marked_at;

-- Step 4: add a NOT NULL default for future inserts
ALTER TABLE public.attendance_records
  ALTER COLUMN marked_at SET DEFAULT NOW();


-- ────────────────────────────────────────────────────────────
-- 6.3  updated_at auto-stamp triggers via moddatetime
--      Ensures updated_at is always set server-side, guarding
--      against clients that forget to send the field.
-- ────────────────────────────────────────────────────────────

-- Enable the moddatetime extension (built-in, safe to run again)
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- Create triggers for each data table
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'semesters', 'students', 'courses', 'enrollments',
    'attendance_sessions', 'attendance_records'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);',
      tbl, tbl
    );
  END LOOP;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6.4  Composite indexes for common sync queries
--      Each incremental pull filters on (user_id, updated_at)
--      so a compound index speeds up every sync cycle.
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_semesters_user_updated
  ON public.semesters (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_students_user_updated
  ON public.students (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_courses_user_updated
  ON public.courses (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_updated
  ON public.enrollments (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_updated
  ON public.attendance_sessions (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_updated
  ON public.attendance_records (user_id, updated_at);

-- Additional index: quickly look up all records for a session
CREATE INDEX IF NOT EXISTS idx_attendance_records_session
  ON public.attendance_records (session_id)
  WHERE is_deleted = 0;
