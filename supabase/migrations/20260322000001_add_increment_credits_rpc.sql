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

GRANT EXECUTE ON FUNCTION public.increment_profile_credits TO service_role;

-- Partial unique index ensures each Stripe event can only produce one sentinel record.
-- The sentinel rows have action = 'stripe_event:<event_id>' and amount = 0.
-- This prevents duplicate credit grants when Stripe retries the same webhook event.
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_stripe_event_unique
  ON public.credit_transactions (action)
  WHERE action LIKE 'stripe_event:%';
