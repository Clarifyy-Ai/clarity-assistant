DROP POLICY IF EXISTS "flags_read" ON public.feature_flags;
DROP POLICY IF EXISTS "Feature flags are viewable by everyone" ON public.feature_flags;
DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_admin_read" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_user_read" ON public.feature_flags;

CREATE POLICY "feature_flags_admin_read"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "feature_flags_user_read"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (
  is_enabled = true
  AND (
    allowed_users IS NULL
    OR cardinality(allowed_users) = 0
    OR auth.uid() = ANY(allowed_users)
  )
);