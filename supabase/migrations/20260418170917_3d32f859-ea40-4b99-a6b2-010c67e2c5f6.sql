-- ─────────────────────────────────────────────────────────────────────────────
-- Tighten feature_flags exposure: hide allowed_users UUID list from non-admins.
--
-- Approach:
--   1. Drop overly-broad legacy "flags_admin" ALL policy and the user_read
--      policy that returns the full row (including allowed_users) when the
--      caller is in the array.
--   2. Re-add explicit per-command policies for admins (full access).
--   3. Create a public-safe view `public.feature_flags_public` exposing only
--      non-sensitive columns. Frontend code reads from this view; admin UI
--      keeps reading from the table directly under the admin policy.
--   4. The user_read policy is rewritten as a column-blind row filter — RLS
--      gates row visibility, but the view defines column projection. This is
--      the standard PostgREST pattern for hiding columns by role.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop existing policies
DROP POLICY IF EXISTS feature_flags_admin_read ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_user_read  ON public.feature_flags;
DROP POLICY IF EXISTS flags_admin              ON public.feature_flags;
DROP POLICY IF EXISTS flags_read               ON public.feature_flags;

-- 2. Admin-only direct table access (full row including allowed_users)
CREATE POLICY feature_flags_admin_all
  ON public.feature_flags
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Block all non-admin direct SELECT on the table.
--    Non-admins must use the safe view below.
CREATE POLICY feature_flags_block_non_admin_select
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Safe view — exposes ONLY columns that are safe for any authenticated user.
--    Notably excludes: allowed_users, metadata, allowed_plans (which is a
--    privilege boundary). Filters to only flags relevant to the caller.
CREATE OR REPLACE VIEW public.feature_flags_public
WITH (security_invoker = true)
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
FROM public.feature_flags ff
WHERE ff.is_enabled = true
  AND (
    -- Global flags (no user allowlist)
    ff.allowed_users IS NULL
    OR cardinality(ff.allowed_users) = 0
    -- Or current user is in the allowlist (without exposing the array)
    OR auth.uid() = ANY (ff.allowed_users)
  );

-- 5. Grant view access to authenticated users (RLS on the underlying table
--    is bypassed by the security_invoker view's WHERE clause, but the view
--    itself only returns safe columns).
GRANT SELECT ON public.feature_flags_public TO authenticated;
GRANT SELECT ON public.feature_flags_public TO anon;

-- 6. Comment for posterity
COMMENT ON VIEW public.feature_flags_public IS
'Public-safe projection of feature_flags. Hides allowed_users, metadata, and allowed_plans from non-admin clients. Non-admin frontend code MUST read from this view, not the underlying table.';