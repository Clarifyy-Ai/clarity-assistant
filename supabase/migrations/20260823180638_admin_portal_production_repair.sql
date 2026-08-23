-- Admin portal production repair:
-- 1) Public feature-flag contract includes disabled keys (kill-switch visibility)
-- 2) Safe demote_admin RPC with last-admin guard
-- 3) Admin SELECT of unpublished blog/help already covered by *_admin_all policies

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature flags: authenticated clients must learn is_enabled=false
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_feature_flags()
RETURNS TABLE (key text, is_enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ff.key::text, ff.is_enabled
  FROM public.feature_flags ff;
$$;

REVOKE ALL ON FUNCTION public.get_public_feature_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_feature_flags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_feature_flags() TO anon;

COMMENT ON FUNCTION public.get_public_feature_flags() IS
  'Public-safe feature flag keys + enabled state (including disabled). No allowlists or secrets.';

-- Keep view for compatibility but include disabled rows; SECURITY DEFINER RPC is the FE contract.
CREATE OR REPLACE VIEW public.feature_flags_public
WITH (security_invoker = false)
AS
SELECT
  ff.id,
  ff.key,
  ff.name,
  ff.description,
  ff.is_enabled,
  ff.rollout_percent,
  ff.created_at,
  ff.updated_at
FROM public.feature_flags ff;

GRANT SELECT ON public.feature_flags_public TO authenticated;
GRANT SELECT ON public.feature_flags_public TO anon;

COMMENT ON VIEW public.feature_flags_public IS
  'Public-safe projection of feature_flags including disabled keys. Hides allowed_users/metadata.';

-- ─────────────────────────────────────────────────────────────────────────────
-- demote_admin: remove admin role with last-admin protection
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.demote_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'admin'
  ) THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer INTO admin_count
  FROM public.user_roles
  WHERE role = 'admin';

  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = 'admin';

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, old_value, new_value)
  VALUES (
    auth.uid(),
    'demote_admin',
    'user',
    p_user_id::text,
    jsonb_build_object('role', 'admin'),
    jsonb_build_object('role', null)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.demote_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demote_admin(uuid) TO authenticated;

COMMENT ON FUNCTION public.demote_admin(uuid) IS
  'Admin-only: remove admin role from a user. Refuses if it would leave zero admins.';
