-- Revoke client-callable EXECUTE on Stripe-only credit increment helper.
-- increment_profile_credits is called exclusively from the stripe-webhook edge function
-- which runs as service_role. No client (anon or authenticated) should be able to
-- call this directly, as it bypasses billing verification.
REVOKE EXECUTE ON FUNCTION public.increment_profile_credits(uuid, integer)
  FROM PUBLIC, anon, authenticated;
