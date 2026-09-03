-- MFA lost-device recovery: hashed one-time codes, hashed email tokens, re-enroll flag.
-- Authenticated clients have no SELECT on secrets. Edge service role only.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_reenrollment_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.mfa_reenrollment_required IS
  'Set after lost-device recovery until a new TOTP factor is verified. Not an MFA bypass.';

CREATE TABLE IF NOT EXISTS public.mfa_recovery_code_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  remaining_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES public.mfa_recovery_code_sets (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_recovery_codes_hash_len CHECK (char_length(code_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS mfa_recovery_codes_user_hash_uidx
  ON public.mfa_recovery_codes (user_id, code_hash);

CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_unused_idx
  ON public.mfa_recovery_codes (user_id)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mfa_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_recovery_tokens_hash_len CHECK (char_length(token_hash) = 64)
);

CREATE INDEX IF NOT EXISTS mfa_recovery_tokens_user_idx
  ON public.mfa_recovery_tokens (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mfa_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT mfa_security_events_action_chk CHECK (
    action IN (
      'mfa_enrolled',
      'mfa_verified',
      'mfa_failed',
      'mfa_factor_revoked',
      'recovery_started',
      'recovery_completed',
      'recovery_failed',
      'recovery_codes_issued',
      'recovery_codes_regenerated',
      'sessions_revoked',
      'reenrollment_required',
      'reenrollment_completed'
    )
  ),
  CONSTRAINT mfa_security_events_status_chk CHECK (status IN ('success', 'failure', 'blocked'))
);

CREATE INDEX IF NOT EXISTS mfa_security_events_user_idx
  ON public.mfa_security_events (user_id, created_at DESC);

ALTER TABLE public.mfa_recovery_code_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_security_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mfa_recovery_code_sets FROM anon, authenticated;
REVOKE ALL ON public.mfa_recovery_codes FROM anon, authenticated;
REVOKE ALL ON public.mfa_recovery_tokens FROM anon, authenticated;
REVOKE ALL ON public.mfa_security_events FROM anon, authenticated;

GRANT ALL ON public.mfa_recovery_code_sets TO service_role;
GRANT ALL ON public.mfa_recovery_codes TO service_role;
GRANT ALL ON public.mfa_recovery_tokens TO service_role;
GRANT ALL ON public.mfa_security_events TO service_role;
