-- ============================================================
-- FIX: Infinite Recursion in Profiles RLS Policy
-- ============================================================

-- 1. Create a SECURITY DEFINER function to check for admin role.
-- This bypasses RLS on the profiles table, preventing recursion.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update profiles policy to use the non-recursive function.
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- 3. Update access_codes policy to use the non-recursive function.
-- This also improves performance for access_code checks.
DROP POLICY IF EXISTS "Admins manage access codes" ON public.access_codes;
CREATE POLICY "Admins manage access codes"
  ON public.access_codes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Grant execute permission to authenticated users.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
