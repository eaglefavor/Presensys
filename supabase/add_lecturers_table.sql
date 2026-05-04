-- Migration to add lecturers table and lecturer_id to attendance_sessions

CREATE TABLE IF NOT EXISTS lecturers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS lecturer_id UUID REFERENCES lecturers(id) ON DELETE SET NULL;

ALTER TABLE lecturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own data" ON lecturers FOR ALL USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'lecturers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lecturers;
  END IF;
END $$;
