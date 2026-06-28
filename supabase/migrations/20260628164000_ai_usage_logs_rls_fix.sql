-- Close permissive INSERT on ai_usage_logs (WITH CHECK true applied to all roles).
-- Edge functions write via service_role, which bypasses RLS.

DROP POLICY IF EXISTS "Service role can insert AI usage" ON public.ai_usage_logs;

CREATE POLICY "Service role can insert AI usage"
  ON public.ai_usage_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated cannot insert AI usage" ON public.ai_usage_logs;
CREATE POLICY "Authenticated cannot insert AI usage"
  ON public.ai_usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
