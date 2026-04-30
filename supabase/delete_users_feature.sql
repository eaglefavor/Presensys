-- ============================================================
-- Admin Users API
-- RPCs for viewing and deleting users from the admin console
-- ============================================================

-- Function to get all users for the admin dashboard
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    full_name TEXT,
    role TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    u.email::text,
    p.full_name::text,
    p.role::text,
    p.status::text,
    u.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY u.created_at DESC;
$$;

-- Only admins may call this function
REVOKE ALL ON FUNCTION public.get_admin_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;


-- Function to completely delete a user and all their data
CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Access denied. Admin privileges required.');
  END IF;

  -- Prevent deleting yourself
  IF auth.uid() = target_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'You cannot delete your own account.');
  END IF;

  -- Delete from auth.users (cascades to profiles and all other data due to foreign keys)
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'User completely deleted.');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Only admins may call this function
REVOKE ALL ON FUNCTION public.delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;
