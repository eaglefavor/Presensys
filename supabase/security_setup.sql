-- Add user_id to all tables for isolation
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS on all tables
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Create Policies (Only users can see/manage their own data)
DROP POLICY IF EXISTS "Users manage own semesters" ON semesters;
CREATE POLICY "Users manage own semesters" ON semesters FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own students" ON students;
CREATE POLICY "Users manage own students" ON students FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own courses" ON courses;
CREATE POLICY "Users manage own courses" ON courses FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own enrollments" ON enrollments;
CREATE POLICY "Users manage own enrollments" ON enrollments FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own sessions" ON attendance_sessions;
CREATE POLICY "Users manage own sessions" ON attendance_sessions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own records" ON attendance_records;
CREATE POLICY "Users manage own records" ON attendance_records FOR ALL USING (auth.uid() = user_id);