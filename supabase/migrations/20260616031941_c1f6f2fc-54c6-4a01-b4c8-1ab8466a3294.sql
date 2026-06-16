
DROP TRIGGER IF EXISTS protect_profiles_admin ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_admin_column() CASCADE;

DROP POLICY IF EXISTS profiles_own_update ON public.profiles;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;

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
  );

REVOKE SELECT ON public.referrals FROM authenticated;
GRANT SELECT (id, referrer_id, referred_id, status, credits_awarded, signed_up_at, converted_at, rewarded_at, created_at)
  ON public.referrals TO authenticated;

REVOKE SELECT ON public.rooms FROM authenticated;
GRANT SELECT (id, host_id, name, description, status, room_code, is_private, max_participants, topic, interview_type, started_at, ended_at, created_at, updated_at)
  ON public.rooms TO authenticated;
