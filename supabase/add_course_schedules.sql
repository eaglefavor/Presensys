-- Migration: Add course_schedules table for flexible multi-slot scheduling.
-- Each course can have multiple schedule slots on different days (or 'Everyday').
-- Run this against your Supabase project once.

CREATE TABLE IF NOT EXISTS course_schedules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN (
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    'Saturday', 'Sunday', 'Everyday'
  )),
  start_time TEXT NOT NULL,  -- 24-hour 'HH:MM' format
  end_time   TEXT NOT NULL,  -- 24-hour 'HH:MM' format
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security
ALTER TABLE course_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own data" ON course_schedules;
CREATE POLICY "Users can see their own data" ON course_schedules
  FOR ALL USING (auth.uid() = user_id);

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'course_schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE course_schedules;
  END IF;
END $$;
