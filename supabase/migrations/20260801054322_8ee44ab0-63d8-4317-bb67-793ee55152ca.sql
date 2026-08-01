-- 1. Fix mutable search_path
ALTER FUNCTION public.check_free_tier_limits(uuid, text) SET search_path = public;
ALTER FUNCTION public.cleanup_expired_documents() SET search_path = public;
ALTER FUNCTION public.increment_profile_credits(uuid, integer, text) SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_topic_performance(text, text, text, integer, integer, numeric) SET search_path = public;

-- 2. Revoke anon EXECUTE on SECURITY DEFINER maintenance function
REVOKE ALL ON FUNCTION public.cleanup_expired_documents() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_documents() TO service_role;

-- 3. Security definer view -> invoker
ALTER VIEW public.ai_daily_costs SET (security_invoker = true);

-- 4. Public bucket listing: drop broad SELECT policy (public CDN downloads unaffected)
DROP POLICY IF EXISTS desktop_releases_public_read ON storage.objects;