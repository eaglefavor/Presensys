-- ============================================================
-- ADMIN ACCOUNT SETUP
-- Run this in the Supabase SQL Editor to promote a specific
-- user to admin and immediately unlock their account.
--
-- Replace 'you@example.com' with the actual admin email.
-- ============================================================

-- Step 1: Find the user's UUID from auth.users by email
-- (Run this first to confirm you have the right user)
SELECT au.id, au.email, p.role, p.status
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.email = 'd.chukwudebelu@stu.unizik.edu.ng';  -- ← replace with your email


-- Step 2: Promote that user to admin + verified
-- (Replace 'you@example.com' with your actual email)
UPDATE public.profiles
SET role   = 'admin',
    status = 'verified',
    invalid_tries = 0
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'd.chukwudebelu@stu.unizik.edu.ng'  -- ← replace
);


-- Step 3: Verify the change took effect
SELECT p.id, au.email, p.role, p.status, p.invalid_tries
FROM public.profiles p
JOIN auth.users au ON au.id = p.id
WHERE p.role = 'admin';
