-- ============================================================
-- verify_access_code  –  RPC called from VerifyAccess.tsx
--
-- Accepts a plain-text code submitted by the user.
-- On success  → marks the code as used, sets the caller's
--               profile status to 'verified', returns
--               { success: true, message: 'Account verified' }
-- On failure  → increments invalid_tries counter, terminates
--               the account after 20 bad attempts, returns
--               { success: false, message: '<reason>' }
--
-- Run this once in the Supabase SQL Editor.
-- ============================================================

-- Drop any existing version first so we can change the return type if needed.
DROP FUNCTION IF EXISTS public.verify_access_code(TEXT);

CREATE OR REPLACE FUNCTION public.verify_access_code(input_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID  := auth.uid();
  v_profile     RECORD;
  v_code_row    RECORD;
BEGIN
  -- 1. Load caller's profile
  SELECT id, status, invalid_tries
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Profile not found. Please sign out and sign in again.');
  END IF;

  -- 2. Already verified or terminated — nothing to do
  IF v_profile.status = 'verified' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Account is already verified.');
  END IF;

  IF v_profile.status = 'terminated' THEN
    RETURN jsonb_build_object('success', false, 'message', 'This account has been terminated due to too many invalid attempts.');
  END IF;

  -- 3. Look up the code (case-insensitive, unused only)
  SELECT id, code, is_used
  INTO v_code_row
  FROM public.access_codes
  WHERE UPPER(code) = UPPER(input_code)
    AND is_used = false
  LIMIT 1;

  IF NOT FOUND THEN
    -- Increment invalid_tries counter
    UPDATE public.profiles
    SET invalid_tries = invalid_tries + 1
    WHERE id = v_user_id;

    -- Check if limit reached → terminate
    IF (v_profile.invalid_tries + 1) >= 20 THEN
      UPDATE public.profiles
      SET status = 'terminated'
      WHERE id = v_user_id;
      RETURN jsonb_build_object('success', false, 'message', 'Account terminated due to too many invalid attempts.');
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid or already-used code. Attempt ' || (v_profile.invalid_tries + 1)::TEXT || ' of 20.'
    );
  END IF;

  -- 4. Valid code — consume it and verify the account
  UPDATE public.access_codes
  SET is_used = true
  WHERE id = v_code_row.id;

  UPDATE public.profiles
  SET status = 'verified', invalid_tries = 0
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Account verified successfully.');
END;
$$;

-- All authenticated users can call this function (RLS on the
-- underlying tables still applies inside the function body).
GRANT EXECUTE ON FUNCTION public.verify_access_code(TEXT) TO authenticated;
