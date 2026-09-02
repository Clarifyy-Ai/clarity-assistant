-- Server-side email verification gate for onboarding completion.

CREATE OR REPLACE FUNCTION public.is_auth_email_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_auth_email_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_auth_email_verified() TO authenticated;

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
SET search_path = public, auth
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

  IF NOT public.is_auth_email_verified() THEN
    RAISE EXCEPTION 'EMAIL_NOT_VERIFIED'
      USING ERRCODE = 'P0001', MESSAGE = 'Verify your email before completing onboarding.';
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
