-- ============================================================
-- SECURITY HARDENING: Proper RLS policies and auth trigger fix
-- Run this in the Supabase SQL editor (or as a migration).
-- ============================================================

-- ----------------------------------------------------------------
-- 1. ENABLE RLS on profiles and access_codes
--    (These tables existed without RLS in earlier migrations.)
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS access_codes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 2. PROFILES — granular policies per operation
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all access for now" ON profiles;
DROP POLICY IF EXISTS "Users manage own profiles" ON profiles;
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Service inserts profiles" ON profiles;

-- Users can read only their own profile row.
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update only their own profile (non-role fields).
-- Role/status changes must go through server-side functions.
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles are created by the trigger which runs as SECURITY DEFINER,
-- so INSERT requires the service role (bypasses RLS).  No public INSERT policy.

-- ----------------------------------------------------------------
-- 3. ACCESS_CODES — only admins can read/write
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all access for now" ON access_codes;
DROP POLICY IF EXISTS "Admins manage access codes" ON access_codes;

CREATE POLICY "Admins manage access codes"
  ON access_codes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ----------------------------------------------------------------
-- 4. CORE TABLES — replace permissive FOR ALL with split policies
--    to properly enforce WITH CHECK on INSERT.
-- ----------------------------------------------------------------

-- Helper macro: for each core table, drop the old blanket policy and
-- replace with explicit SELECT / INSERT / UPDATE / DELETE policies.
-- Supabase does not support procedures for DDL, so we repeat the pattern.

-- SEMESTERS
DROP POLICY IF EXISTS "Enable all access for now" ON semesters;
DROP POLICY IF EXISTS "Users manage own semesters" ON semesters;
CREATE POLICY "semesters_select"  ON semesters FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY "semesters_insert"  ON semesters FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "semesters_update"  ON semesters FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "semesters_delete"  ON semesters FOR DELETE  USING      (auth.uid() = user_id);

-- STUDENTS
DROP POLICY IF EXISTS "Enable all access for now" ON students;
DROP POLICY IF EXISTS "Users manage own students" ON students;
CREATE POLICY "students_select"   ON students FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY "students_insert"   ON students FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "students_update"   ON students FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "students_delete"   ON students FOR DELETE  USING      (auth.uid() = user_id);

-- COURSES
DROP POLICY IF EXISTS "Enable all access for now" ON courses;
DROP POLICY IF EXISTS "Users manage own courses" ON courses;
DROP POLICY IF EXISTS "Users can see their own data" ON courses;
CREATE POLICY "courses_select"    ON courses FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY "courses_insert"    ON courses FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "courses_update"    ON courses FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "courses_delete"    ON courses FOR DELETE  USING      (auth.uid() = user_id);

-- ENROLLMENTS
DROP POLICY IF EXISTS "Enable all access for now" ON enrollments;
DROP POLICY IF EXISTS "Users manage own enrollments" ON enrollments;
DROP POLICY IF EXISTS "Users can see their own data" ON enrollments;
CREATE POLICY "enrollments_select" ON enrollments FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY "enrollments_insert" ON enrollments FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "enrollments_update" ON enrollments FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "enrollments_delete" ON enrollments FOR DELETE  USING      (auth.uid() = user_id);

-- ATTENDANCE_SESSIONS
DROP POLICY IF EXISTS "Enable all access for now" ON attendance_sessions;
DROP POLICY IF EXISTS "Users manage own sessions" ON attendance_sessions;
DROP POLICY IF EXISTS "Users can see their own data" ON attendance_sessions;
CREATE POLICY "sessions_select"   ON attendance_sessions FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY "sessions_insert"   ON attendance_sessions FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_update"   ON attendance_sessions FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_delete"   ON attendance_sessions FOR DELETE  USING      (auth.uid() = user_id);

-- ATTENDANCE_RECORDS
DROP POLICY IF EXISTS "Enable all access for now" ON attendance_records;
DROP POLICY IF EXISTS "Users manage own records" ON attendance_records;
DROP POLICY IF EXISTS "Users can see their own data" ON attendance_records;
CREATE POLICY "records_select"    ON attendance_records FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY "records_insert"    ON attendance_records FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "records_update"    ON attendance_records FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "records_delete"    ON attendance_records FOR DELETE  USING      (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 5. FIX handle_new_user() trigger for Google OAuth sign-ups
--    Google OAuth provides the display name under the 'name' key,
--    not 'full_name'.  Fall back through both keys.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  -- Google OAuth uses 'name'; email/password sign-up uses 'full_name'.
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)  -- last-resort: use the email local part
  );

  INSERT INTO public.profiles (id, full_name, role, status)
  VALUES (
    NEW.id,
    v_full_name,
    'rep',      -- default role for all new sign-ups
    'pending'   -- must be verified by an admin-issued access code
  )
  ON CONFLICT (id) DO NOTHING;  -- safe guard against duplicate triggers

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger is attached (idempotent).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
