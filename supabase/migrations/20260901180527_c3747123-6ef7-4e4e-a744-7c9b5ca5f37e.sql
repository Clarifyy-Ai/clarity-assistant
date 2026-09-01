DROP POLICY IF EXISTS scorecards_public_share ON public.scorecards;
DROP POLICY IF EXISTS session_debriefs_public_share ON public.session_debriefs;

ALTER VIEW public.feature_flags_public SET (security_invoker = true);

ALTER FUNCTION public.set_updated_at_topic_mastery() SET search_path = public;
ALTER FUNCTION public.set_updated_at_exam_readiness() SET search_path = public;
ALTER FUNCTION public.set_updated_at_preparation_plans() SET search_path = public;
ALTER FUNCTION public.validate_full_name() SET search_path = public;
ALTER FUNCTION public.compute_gov_bank_readiness_status(bigint, integer) SET search_path = public;
ALTER FUNCTION public.question_is_assessment_ready(public.questions) SET search_path = public;
ALTER FUNCTION public.session_utc_day_start(timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.next_support_public_ref() SET search_path = public;
ALTER FUNCTION public.plan_monthly_credits(text) SET search_path = public;
ALTER FUNCTION public.prevent_unknown_license_publish() SET search_path = public;
ALTER FUNCTION public.is_frontend_only_category(text) SET search_path = public;
ALTER FUNCTION public.assessment_default_roles(text) SET search_path = public;
ALTER FUNCTION public.assessment_option_labels(jsonb) SET search_path = public;
ALTER FUNCTION public.raise_assessment_start_error(text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.question_matches_template_taxonomy(public.questions, text, text[], boolean) SET search_path = public;
ALTER FUNCTION public.normalize_company_name(text) SET search_path = public;
ALTER FUNCTION public.validate_answer_bank_quality() SET search_path = public;
ALTER FUNCTION public.validate_question_publication() SET search_path = public;