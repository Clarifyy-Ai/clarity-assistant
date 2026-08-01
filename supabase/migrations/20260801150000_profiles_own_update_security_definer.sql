-- Fix profiles_own_update 403s after column-level REVOKE on stripe_customer_id /
-- subscription_id. Plain WITH CHECK subqueries run as the invoking role and cannot
-- read those columns, so privileged comparisons always fail for users who have
-- billing identifiers set. Compare via SECURITY DEFINER instead.
-- Also use IS NOT DISTINCT FROM so NULL privileged values do not fail equality.

CREATE OR REPLACE FUNCTION public.profiles_own_update_allowed(proposed public.profiles)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS current
    WHERE current.id = auth.uid()
      AND proposed.id = auth.uid()
      AND current.plan_id IS NOT DISTINCT FROM proposed.plan_id
      AND current.credits IS NOT DISTINCT FROM proposed.credits
      AND current.is_banned IS NOT DISTINCT FROM proposed.is_banned
      AND current.stripe_customer_id IS NOT DISTINCT FROM proposed.stripe_customer_id
      AND current.subscription_id IS NOT DISTINCT FROM proposed.subscription_id
      AND current.ban_reason IS NOT DISTINCT FROM proposed.ban_reason
      AND current.subscription_status IS NOT DISTINCT FROM proposed.subscription_status
      AND current.credits_used_this_month IS NOT DISTINCT FROM proposed.credits_used_this_month
      AND current.credits_reset_at IS NOT DISTINCT FROM proposed.credits_reset_at
      AND current.referred_by IS NOT DISTINCT FROM proposed.referred_by
      AND current.referral_code IS NOT DISTINCT FROM proposed.referral_code
      AND current.xp IS NOT DISTINCT FROM proposed.xp
      AND current.level IS NOT DISTINCT FROM proposed.level
      AND current.total_sessions IS NOT DISTINCT FROM proposed.total_sessions
      AND current.payment_failed_at IS NOT DISTINCT FROM proposed.payment_failed_at
      AND current.pending_promo_code IS NOT DISTINCT FROM proposed.pending_promo_code
      AND current.byok_gemini IS NOT DISTINCT FROM proposed.byok_gemini
      AND current.byok_openai IS NOT DISTINCT FROM proposed.byok_openai
      AND current.byok_anthropic IS NOT DISTINCT FROM proposed.byok_anthropic
  );
$$;

REVOKE ALL ON FUNCTION public.profiles_own_update_allowed(public.profiles) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profiles_own_update_allowed(public.profiles) TO authenticated;

DROP POLICY IF EXISTS profiles_own_update ON public.profiles;

CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (public.profiles_own_update_allowed(profiles));
