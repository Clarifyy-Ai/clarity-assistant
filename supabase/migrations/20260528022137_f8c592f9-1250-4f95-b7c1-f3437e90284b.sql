
-- =====================================================================
-- 1. Move pg_trgm to extensions schema (Supabase linter best practice)
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END$$;

-- Make trigram operators resolvable everywhere
ALTER DATABASE postgres SET search_path = "$user", public, extensions;

-- =====================================================================
-- 2. Lock down SECURITY DEFINER functions
--    Revoke PUBLIC, then grant explicitly to the correct roles.
-- =====================================================================

-- ---- User-facing functions (auth users may call) -------------------
REVOKE EXECUTE ON FUNCTION public.deduct_credits(text, integer, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deduct_credits(text, integer, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_notifications_read(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_topic_performance(text, text, text, integer, integer, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_topic_performance(text, text, text, integer, integer, numeric) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ---- Admin RPCs (already check has_role inside, but tighten grant) -
REVOKE EXECUTE ON FUNCTION public.bulk_update_users(uuid[], jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bulk_update_users(uuid[], jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_perf_stats(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_admin_perf_stats(integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_dau_mau(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_admin_dau_mau(integer) TO authenticated, service_role;

-- ---- System-only functions (service_role only) ---------------------
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.refund_credits(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_profile_credits(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_profile_credits(uuid, integer, text) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.increment_profile_credits(uuid, integer, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, credit_action, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, credit_action, text, text) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.add_credits(uuid, integer, credit_action, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_expired_session_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_expired_session_data() FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.delete_expired_session_data() TO service_role;

-- =====================================================================
-- 3. Defense-in-depth: harden function bodies with explicit role checks
-- =====================================================================

CREATE OR REPLACE FUNCTION public.increment_profile_credits(p_user_id uuid, p_credits integer, p_customer_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only service_role (edge functions / Stripe webhook) may call this
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: service_role required';
  END IF;

  UPDATE public.profiles
  SET credits            = COALESCE(credits, 0) + p_credits,
      stripe_customer_id = p_customer_id,
      updated_at         = NOW()
  WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_credits(p_cost integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     UUID := auth.uid();
  v_new_balance INTEGER;
  MAX_REFUND CONSTANT INTEGER := 5;
BEGIN
  -- service_role only (called by edge functions on AI failure)
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_cost <= 0 OR p_cost > MAX_REFUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
  END IF;

  UPDATE profiles
     SET credits = credits + p_cost, updated_at = NOW()
   WHERE id = v_user_id
   RETURNING credits INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;

-- Re-apply grants after CREATE OR REPLACE (Postgres resets them)
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM PUBLIC, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.refund_credits(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_profile_credits(uuid, integer, text) FROM PUBLIC, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.increment_profile_credits(uuid, integer, text) TO service_role;
