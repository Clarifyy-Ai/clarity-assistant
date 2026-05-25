-- Atomic credit increment RPC for Stripe webhook credit purchase processing.
-- Using an atomic UPDATE expression prevents race conditions from concurrent
-- webhook retries or deliveries.

CREATE OR REPLACE FUNCTION public.increment_profile_credits(
  p_user_id    UUID,
  p_credits    INTEGER,
  p_customer_id TEXT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.profiles
  SET
    credits             = COALESCE(credits, 0) + p_credits,
    stripe_customer_id  = p_customer_id
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_profile_credits(UUID, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.increment_profile_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_profile_credits(UUID, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.increment_profile_credits(UUID, INTEGER, TEXT) FROM authenticated;

-- Stripe idempotency: use a dedicated text column (see stripe-webhook handler) rather than
-- a partial index on enum `action` (LIKE/cast breaks on Postgres enum types).
