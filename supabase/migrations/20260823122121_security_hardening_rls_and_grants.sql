-- Fix ERROR: questions_playable was SECURITY DEFINER (security_invoker=false)
ALTER VIEW public.questions_playable SET (security_invoker = true);

-- Service-role-only tables: keep RLS on with no client policies (deny-by-default).
REVOKE ALL ON TABLE public.ai_test_cache FROM anon, authenticated;
REVOKE ALL ON TABLE public.idempotency_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM anon, authenticated;

-- Revoke EXECUTE on internal SECURITY DEFINER helpers from anon/public.
REVOKE EXECUTE ON FUNCTION public.assert_owned_session_rpc(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.flag_stale_current_affairs() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.protect_question_assessment_taxonomy() FROM anon, public;

-- These helpers must not be client-callable with arbitrary arguments.
REVOKE EXECUTE ON FUNCTION public.assert_owned_session_rpc(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_stale_current_affairs() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_question_assessment_taxonomy() FROM authenticated;

DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.session_utc_day_start() SET search_path = public';
EXCEPTION WHEN undefined_function THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'ALTER FUNCTION public.session_duration_seconds(timestamptz, timestamptz) SET search_path = public';
EXCEPTION WHEN undefined_function THEN NULL; WHEN others THEN NULL; END $$;
