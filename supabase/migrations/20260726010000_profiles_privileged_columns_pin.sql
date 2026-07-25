-- Pin privileged profile columns so authenticated users cannot spoof
-- entitlement, usage, referral, or gamification state via PostgREST UPDATE.

DROP POLICY IF EXISTS profiles_own_update ON public.profiles;

CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND plan_id = (SELECT p.plan_id FROM public.profiles p WHERE p.id = auth.uid())
    AND credits = (SELECT p.credits FROM public.profiles p WHERE p.id = auth.uid())
    AND is_banned = (SELECT p.is_banned FROM public.profiles p WHERE p.id = auth.uid())
    AND NOT (stripe_customer_id IS DISTINCT FROM (SELECT p.stripe_customer_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND NOT (subscription_id IS DISTINCT FROM (SELECT p.subscription_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND NOT (ban_reason IS DISTINCT FROM (SELECT p.ban_reason FROM public.profiles p WHERE p.id = auth.uid()))
    AND NOT (subscription_status IS DISTINCT FROM (SELECT p.subscription_status FROM public.profiles p WHERE p.id = auth.uid()))
    AND credits_used_this_month = (SELECT p.credits_used_this_month FROM public.profiles p WHERE p.id = auth.uid())
    AND NOT (credits_reset_at IS DISTINCT FROM (SELECT p.credits_reset_at FROM public.profiles p WHERE p.id = auth.uid()))
    AND NOT (referred_by IS DISTINCT FROM (SELECT p.referred_by FROM public.profiles p WHERE p.id = auth.uid()))
    AND NOT (referral_code IS DISTINCT FROM (SELECT p.referral_code FROM public.profiles p WHERE p.id = auth.uid()))
    AND xp = (SELECT p.xp FROM public.profiles p WHERE p.id = auth.uid())
    AND level = (SELECT p.level FROM public.profiles p WHERE p.id = auth.uid())
    AND total_sessions = (SELECT p.total_sessions FROM public.profiles p WHERE p.id = auth.uid())
  );
