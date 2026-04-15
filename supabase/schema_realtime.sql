-- UNIZIK ATTENDANCE PWA SCHEMA - UPDATED FOR REALTIME SYNC
-- Idempotent: safe to run against a database that already has some or all of these tables.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SEMESTERS
CREATE TABLE IF NOT EXISTS semesters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. STUDENTS
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reg_number TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, reg_number)
);

-- 3. COURSES
CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  semester_id UUID REFERENCES semesters(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ENROLLMENTS
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);

-- 5. ATTENDANCE SESSIONS
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  title TEXT,
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. ATTENDANCE RECORDS
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('present', 'absent', 'excused')) NOT NULL,
  marked_at BIGINT NOT NULL, -- JS Date.now()
  user_id UUID DEFAULT auth.uid(),
  is_deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- ENABLE RLS
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- SIMPLE POLICIES — drop first so re-running is safe
DROP POLICY IF EXISTS "Users can see their own data" ON semesters;
DROP POLICY IF EXISTS "Users can see their own data" ON students;
DROP POLICY IF EXISTS "Users can see their own data" ON courses;
DROP POLICY IF EXISTS "Users can see their own data" ON enrollments;
DROP POLICY IF EXISTS "Users can see their own data" ON attendance_sessions;
DROP POLICY IF EXISTS "Users can see their own data" ON attendance_records;

CREATE POLICY "Users can see their own data" ON semesters FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see their own data" ON students FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see their own data" ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see their own data" ON enrollments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see their own data" ON attendance_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can see their own data" ON attendance_records FOR ALL USING (auth.uid() = user_id);

-- ENABLE REALTIME — add each table only if not already in the publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'semesters') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE semesters;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'students') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE students;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'courses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE courses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'enrollments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE enrollments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_sessions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_records') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
  END IF;
END $$;
