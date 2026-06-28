
-- 1. profiles: revoke column-level SELECT on stripe identifiers
REVOKE SELECT (stripe_customer_id, subscription_id) ON public.profiles FROM authenticated;
REVOKE SELECT (stripe_customer_id, subscription_id) ON public.profiles FROM anon;

-- 2. calendar_integrations: revoke and re-grant safe column subset
REVOKE SELECT ON public.calendar_integrations FROM authenticated;
REVOKE SELECT ON public.calendar_integrations FROM anon;
GRANT SELECT (id, user_id, provider, created_at, expires_at) ON public.calendar_integrations TO authenticated;

-- 3. rooms: revoke and re-grant safe column subset (excluding password_hash)
REVOKE SELECT ON public.rooms FROM authenticated;
REVOKE SELECT ON public.rooms FROM anon;
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'rooms'
    AND column_name <> 'password_hash';
  EXECUTE format('GRANT SELECT (%s) ON public.rooms TO authenticated', cols);
END $$;

-- 4. request_metrics: harden insert policy with explicit non-null user_id
DROP POLICY IF EXISTS request_metrics_authed_insert ON public.request_metrics;
CREATE POLICY request_metrics_authed_insert ON public.request_metrics
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());
