-- PENDING: Apply via `supabase db push` after review.
-- Hardens refund_credits: revoke authenticated EXECUTE; only service_role may call.
-- Replaces client-callable refund path with edge-only refunds.

REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_credits(integer) TO service_role;

-- Optional: tighten function body to reject non-service_role callers when called via SQL:
-- Add at start of refund_credits body:
--   IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
--     RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
--   END IF;
