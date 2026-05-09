CREATE TABLE IF NOT EXISTS student_credentials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE student_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own student_credentials" ON student_credentials FOR ALL USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'student_credentials') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE student_credentials;
  END IF;
END $$;
