-- =============================================================================
-- WebAuthn Setup Migration
-- Run this against your Supabase project to replace the old fingerprint_id
-- column with proper WebAuthn credential storage.
-- =============================================================================

-- 1. Drop the old fingerprint_id column from students
--    (Credentials are now stored separately in student_credentials.)
ALTER TABLE students
  DROP COLUMN IF EXISTS fingerprint_id;

-- =============================================================================
-- 2. student_credentials
--    One row per registered WebAuthn credential.  A student may have at most
--    one credential per user_id (the course rep who enrolled them), enforced by
--    the unique index on (student_id, user_id).
-- =============================================================================
CREATE TABLE IF NOT EXISTS student_credentials (
  id            uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id    uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text        NOT NULL,
  public_key    text        NOT NULL,   -- base64url-encoded COSE public key
  counter       integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_credentials_credential_id_key UNIQUE (credential_id),
  CONSTRAINT student_credentials_student_user_key  UNIQUE (student_id, user_id)
);

ALTER TABLE student_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own student credentials"
  ON student_credentials FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own student credentials"
  ON student_credentials FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own student credentials"
  ON student_credentials FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own student credentials"
  ON student_credentials FOR DELETE
  USING (user_id = auth.uid());

-- =============================================================================
-- 3. webauthn_challenges
--    Short-lived challenge strings generated server-side for each registration
--    or authentication attempt.  Cleaned up automatically after use or expiry.
-- =============================================================================
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id  uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge   text        NOT NULL,
  type        text        NOT NULL CHECK (type IN ('registration', 'authentication')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + INTERVAL '5 minutes'
);

ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Only the service-role key (used by Edge Functions) should read/write challenges.
-- Authenticated users have no direct access; the Edge Functions run as service role.
-- If you need to allow authenticated users to interact directly, add policies here.

-- Automatically delete expired challenges (optional, run periodically):
-- DELETE FROM webauthn_challenges WHERE expires_at < now();

-- =============================================================================
-- 4. Helper: updated_at trigger for student_credentials
-- =============================================================================
CREATE OR REPLACE FUNCTION update_student_credentials_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_credentials_updated_at ON student_credentials;
CREATE TRIGGER set_student_credentials_updated_at
  BEFORE UPDATE ON student_credentials
  FOR EACH ROW EXECUTE FUNCTION update_student_credentials_updated_at();
