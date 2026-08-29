-- Server-side onboarding gate: users cannot self-set onboarding_completed via RLS.
-- Completion is only allowed through complete_onboarding() SECURITY DEFINER RPC.

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
      AND current.onboarding_completed IS NOT DISTINCT FROM proposed.onboarding_completed
      AND current.onboarding_step IS NOT DISTINCT FROM proposed.onboarding_step
  );
$$;

REVOKE ALL ON FUNCTION public.profiles_own_update_allowed(public.profiles) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profiles_own_update_allowed(public.profiles) TO authenticated;

-- Authoritative onboarding completion (required role + experience level).
CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_target_role text,
  p_experience_level text,
  p_preferred_model text DEFAULT NULL,
  p_experience_years integer DEFAULT NULL,
  p_notification_prefs jsonb DEFAULT NULL,
  p_audio_input_device text DEFAULT NULL,
  p_industry text DEFAULT NULL,
  p_interview_date date DEFAULT NULL,
  p_improvement_goals text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  current_prefs jsonb;
  merged_prefs jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED'
      USING ERRCODE = 'P0001', MESSAGE = 'Authentication required.';
  END IF;

  IF p_target_role IS NULL OR btrim(p_target_role) = '' THEN
    RAISE EXCEPTION 'ONBOARDING_REQUIRED'
      USING ERRCODE = 'P0001', MESSAGE = 'Choose a target role before completing onboarding.';
  END IF;

  IF p_experience_level IS NULL OR btrim(p_experience_level) = '' THEN
    RAISE EXCEPTION 'ONBOARDING_REQUIRED'
      USING ERRCODE = 'P0001', MESSAGE = 'Choose an experience level before completing onboarding.';
  END IF;

  SELECT COALESCE(notification_prefs, '{}'::jsonb)
  INTO current_prefs
  FROM public.profiles
  WHERE id = uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND'
      USING ERRCODE = 'P0001', MESSAGE = 'Profile not found.';
  END IF;

  merged_prefs :=
    current_prefs
    || COALESCE(p_notification_prefs, '{}'::jsonb)
    || jsonb_build_object('experience_level', btrim(p_experience_level));

  UPDATE public.profiles
  SET
    target_role = btrim(p_target_role),
    experience_years = COALESCE(p_experience_years, experience_years),
    preferred_model = COALESCE(
      p_preferred_model::public.ai_model,
      preferred_model
    ),
    notification_prefs = merged_prefs,
    audio_input_device = COALESCE(p_audio_input_device, audio_input_device),
    industry = COALESCE(p_industry, industry),
    domain = COALESCE(p_industry, domain),
    interview_date = COALESCE(p_interview_date, interview_date),
    improvement_goals = COALESCE(p_improvement_goals, improvement_goals),
    interview_weaknesses = COALESCE(p_improvement_goals, interview_weaknesses),
    onboarding_completed = true,
    onboarding_step = 99,
    updated_at = now()
  WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding(
  text, text, text, integer, jsonb, text, text, date, text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(
  text, text, text, integer, jsonb, text, text, date, text[]
) TO authenticated;

-- Derived onboarding state for clients (not used as sole gate).
CREATE OR REPLACE FUNCTION public.get_onboarding_state()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.onboarding_completed IS TRUE THEN 'COMPLETED'
    WHEN p.onboarding_step > 0 AND p.onboarding_step < 99 THEN 'IN_PROGRESS'
    ELSE 'NOT_STARTED'
  END
  FROM public.profiles AS p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_onboarding_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_onboarding_state() TO authenticated;
