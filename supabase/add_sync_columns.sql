-- MIGRATION: Add Sync Columns
-- Run this in your Supabase SQL Editor to fix the "column not found" errors.

-- 1. Semesters
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS last_modified BIGINT DEFAULT (extract(epoch from now()) * 1000);
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;

-- 2. Students
ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_modified BIGINT DEFAULT (extract(epoch from now()) * 1000);
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;

-- 3. Courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_modified BIGINT DEFAULT (extract(epoch from now()) * 1000);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;

-- 4. Enrollments
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS last_modified BIGINT DEFAULT (extract(epoch from now()) * 1000);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;

-- 5. Attendance Sessions
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS last_modified BIGINT DEFAULT (extract(epoch from now()) * 1000);
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;

-- 6. Attendance Records
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS last_modified BIGINT DEFAULT (extract(epoch from now()) * 1000);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;

-- Update RLS Policies to strictly use user_id
-- (Optional: You can enable these later for better security)
-- CREATE POLICY "Users can only access their own data" ON students FOR ALL USING (auth.uid() = user_id);
-- ... repeat for others
