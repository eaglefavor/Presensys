-- Migration V2: Upgrade to Realtime Sync Schema (Clean Slate)
-- Using NULL for conversion to ensure clean UUID types.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

TRUNCATE TABLE attendance_records, attendance_sessions, enrollments, courses, students, semesters CASCADE;

-- DROP ALL FKs FIRST to be absolutely sure
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_semester_id_fkey;
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_fkey;
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_course_id_fkey;
ALTER TABLE attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_course_id_fkey;
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_session_id_fkey;
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_student_id_fkey;

-- 1. SEMESTERS
ALTER TABLE semesters ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE semesters ALTER COLUMN id TYPE UUID USING NULL;
ALTER TABLE semesters ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- 2. STUDENTS
ALTER TABLE students ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE students ALTER COLUMN id TYPE UUID USING NULL;
ALTER TABLE students ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- 3. COURSES
ALTER TABLE courses ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE courses ALTER COLUMN id TYPE UUID USING NULL;
ALTER TABLE courses ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE courses ALTER COLUMN semester_id TYPE UUID USING NULL;

-- 4. ENROLLMENTS
ALTER TABLE enrollments ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE enrollments ALTER COLUMN id TYPE UUID USING NULL;
ALTER TABLE enrollments ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE enrollments ALTER COLUMN student_id TYPE UUID USING NULL;
ALTER TABLE enrollments ALTER COLUMN course_id TYPE UUID USING NULL;

-- 5. ATTENDANCE SESSIONS
ALTER TABLE attendance_sessions ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE attendance_sessions ALTER COLUMN id TYPE UUID USING NULL;
ALTER TABLE attendance_sessions ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE attendance_sessions ALTER COLUMN course_id TYPE UUID USING NULL;

-- 6. ATTENDANCE RECORDS
ALTER TABLE attendance_records ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE attendance_records ALTER COLUMN id TYPE UUID USING NULL;
ALTER TABLE attendance_records ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE attendance_records ALTER COLUMN session_id TYPE UUID USING NULL;
ALTER TABLE attendance_records ALTER COLUMN student_id TYPE UUID USING NULL;

-- ADD TIMESTAMPS
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- RE-ADD FKs
ALTER TABLE courses ADD CONSTRAINT courses_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE attendance_sessions ADD CONSTRAINT attendance_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- RE-ADD PKs (Ensure they are primary keys after type change)
-- Usually ALTER TABLE ... TYPE UUID preserves PK status if it was PK before, but good to check if needed.

-- ENABLE REALTIME
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