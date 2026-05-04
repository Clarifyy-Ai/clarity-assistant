
-- ============ PROFILES ============
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_own_update ON public.profiles;

CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Own update, scoped to authenticated, with WITH CHECK that pins sensitive columns to their existing values.
CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin            = (SELECT p.is_admin            FROM public.profiles p WHERE p.id = auth.uid())
    AND plan_id             IS NOT DISTINCT FROM (SELECT p.plan_id             FROM public.profiles p WHERE p.id = auth.uid())
    AND credits             = (SELECT p.credits             FROM public.profiles p WHERE p.id = auth.uid())
    AND stripe_customer_id  IS NOT DISTINCT FROM (SELECT p.stripe_customer_id  FROM public.profiles p WHERE p.id = auth.uid())
    AND subscription_id     IS NOT DISTINCT FROM (SELECT p.subscription_id     FROM public.profiles p WHERE p.id = auth.uid())
    AND is_banned           IS NOT DISTINCT FROM (SELECT p.is_banned           FROM public.profiles p WHERE p.id = auth.uid())
    AND ban_reason          IS NOT DISTINCT FROM (SELECT p.ban_reason          FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ============ USER_ROLES ============
DROP POLICY IF EXISTS user_roles_admin ON public.user_roles;

-- ============ REFERRALS ============
DROP POLICY IF EXISTS referrals_admin ON public.referrals;
DROP POLICY IF EXISTS referrals_insert ON public.referrals;
DROP POLICY IF EXISTS referrals_select ON public.referrals;
DROP POLICY IF EXISTS referrals_update ON public.referrals;

CREATE POLICY referrals_admin ON public.referrals
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY referrals_select ON public.referrals
  FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id);

CREATE POLICY referrals_insert ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = referrer_id);

CREATE POLICY referrals_update ON public.referrals
  FOR UPDATE TO authenticated
  USING (auth.uid() = referrer_id)
  WITH CHECK (auth.uid() = referrer_id);
