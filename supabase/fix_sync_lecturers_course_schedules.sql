-- Idempotent sync hardening for lecturers + course schedules.
-- Safe to run on existing projects.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS moddatetime;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS day TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS lecturers TEXT;

CREATE TABLE IF NOT EXISTS public.lecturers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.course_schedules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN (
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    'Saturday', 'Sunday', 'Everyday'
  )),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS lecturer_id UUID REFERENCES public.lecturers(id) ON DELETE SET NULL;

ALTER TABLE public.lecturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own data" ON public.lecturers;
DROP POLICY IF EXISTS "Users can see their own data" ON public.course_schedules;
DROP POLICY IF EXISTS "lecturers_select" ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_insert" ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_update" ON public.lecturers;
DROP POLICY IF EXISTS "lecturers_delete" ON public.lecturers;
DROP POLICY IF EXISTS "course_schedules_select" ON public.course_schedules;
DROP POLICY IF EXISTS "course_schedules_insert" ON public.course_schedules;
DROP POLICY IF EXISTS "course_schedules_update" ON public.course_schedules;
DROP POLICY IF EXISTS "course_schedules_delete" ON public.course_schedules;

CREATE POLICY "lecturers_select" ON public.lecturers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "lecturers_insert" ON public.lecturers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lecturers_update" ON public.lecturers
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lecturers_delete" ON public.lecturers
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "course_schedules_select" ON public.course_schedules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "course_schedules_insert" ON public.course_schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "course_schedules_update" ON public.course_schedules
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "course_schedules_delete" ON public.course_schedules
  FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'lecturers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lecturers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'course_schedules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.course_schedules;
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at ON public.lecturers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.lecturers
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

DROP TRIGGER IF EXISTS set_updated_at ON public.course_schedules;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.course_schedules
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE INDEX IF NOT EXISTS idx_lecturers_user_updated
  ON public.lecturers (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_course_schedules_user_updated
  ON public.course_schedules (user_id, updated_at);
