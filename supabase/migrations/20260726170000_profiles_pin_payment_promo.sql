-- Ensure billing/promo/BYOK columns exist, then pin them on profiles_own_update
-- so clients cannot reset grace, attach promos, or spoof BYOK flags.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_promo_code TEXT,
  ADD COLUMN IF NOT EXISTS byok_gemini BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS byok_openai BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS byok_anthropic BOOLEAN NOT NULL DEFAULT FALSE;

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
    AND NOT (payment_failed_at IS DISTINCT FROM (SELECT p.payment_failed_at FROM public.profiles p WHERE p.id = auth.uid()))
    AND NOT (pending_promo_code IS DISTINCT FROM (SELECT p.pending_promo_code FROM public.profiles p WHERE p.id = auth.uid()))
    AND byok_gemini = (SELECT p.byok_gemini FROM public.profiles p WHERE p.id = auth.uid())
    AND byok_openai = (SELECT p.byok_openai FROM public.profiles p WHERE p.id = auth.uid())
    AND byok_anthropic = (SELECT p.byok_anthropic FROM public.profiles p WHERE p.id = auth.uid())
  );
