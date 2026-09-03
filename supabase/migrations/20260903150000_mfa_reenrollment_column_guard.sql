-- Prevent authenticated clients from clearing lost-device re-enrollment.
-- Only the service role (mfa-recovery Edge function) may change this column.

CREATE OR REPLACE FUNCTION public.protect_mfa_reenrollment_required()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mfa_reenrollment_required IS DISTINCT FROM OLD.mfa_reenrollment_required
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'mfa_reenrollment_required is server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_mfa_reenrollment_required ON public.profiles;
CREATE TRIGGER trg_protect_mfa_reenrollment_required
  BEFORE UPDATE OF mfa_reenrollment_required ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_mfa_reenrollment_required();

REVOKE ALL ON FUNCTION public.protect_mfa_reenrollment_required() FROM PUBLIC, anon, authenticated;

-- Explicit deny: recovery secrets are service-role only even if GRANTs drift.
DROP POLICY IF EXISTS mfa_recovery_code_sets_deny_client ON public.mfa_recovery_code_sets;
CREATE POLICY mfa_recovery_code_sets_deny_client
  ON public.mfa_recovery_code_sets
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS mfa_recovery_codes_deny_client ON public.mfa_recovery_codes;
CREATE POLICY mfa_recovery_codes_deny_client
  ON public.mfa_recovery_codes
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS mfa_recovery_tokens_deny_client ON public.mfa_recovery_tokens;
CREATE POLICY mfa_recovery_tokens_deny_client
  ON public.mfa_recovery_tokens
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS mfa_security_events_deny_client ON public.mfa_security_events;
CREATE POLICY mfa_security_events_deny_client
  ON public.mfa_security_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
