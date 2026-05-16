-- PIN Blitz backend tables
-- Run once in Supabase SQL editor (or with npm run db:deploy).

CREATE TABLE IF NOT EXISTS student_pins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lock_until TIMESTAMPTZ,
  user_id UUID DEFAULT auth.uid() NOT NULL,
  is_deleted INTEGER DEFAULT 0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (student_id, user_id)
);

CREATE TABLE IF NOT EXISTS pin_blitz_challenges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  user_id UUID DEFAULT auth.uid() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS pin_blitz_attempts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  ip_hash TEXT,
  user_id UUID DEFAULT auth.uid() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_pins_user_student
  ON student_pins(user_id, student_id);

CREATE INDEX IF NOT EXISTS idx_pin_blitz_challenges_lookup
  ON pin_blitz_challenges(user_id, student_id, session_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_pin_blitz_attempts_user_session
  ON pin_blitz_attempts(user_id, session_id, created_at DESC);

ALTER TABLE student_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_blitz_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_blitz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_pins_all" ON student_pins;
DROP POLICY IF EXISTS "pin_blitz_challenges_all" ON pin_blitz_challenges;
DROP POLICY IF EXISTS "pin_blitz_attempts_all" ON pin_blitz_attempts;

CREATE POLICY "student_pins_all" ON student_pins
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pin_blitz_challenges_all" ON pin_blitz_challenges
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pin_blitz_attempts_all" ON pin_blitz_attempts
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

