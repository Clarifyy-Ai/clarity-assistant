-- Google Calendar OAuth hardening
-- Canonical grant store remains google_calendar_refresh_tokens (service_role only).
-- Adds PKCE state, connection metadata (no client-readable tokens), interview sync status.

-- ── 1. OAuth state (PKCE + replay protection) ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_oauth_states (
  state          TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier  TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  nonce          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ
);

COMMENT ON TABLE public.calendar_oauth_states IS
  'Short-lived Google Calendar OAuth state + PKCE verifier. Service role only; never exposed to clients.';

CREATE INDEX IF NOT EXISTS calendar_oauth_states_user_id_idx
  ON public.calendar_oauth_states (user_id);
CREATE INDEX IF NOT EXISTS calendar_oauth_states_expires_at_idx
  ON public.calendar_oauth_states (expires_at);

ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.calendar_oauth_states FROM PUBLIC;
REVOKE ALL ON TABLE public.calendar_oauth_states FROM anon;
REVOKE ALL ON TABLE public.calendar_oauth_states FROM authenticated;
GRANT ALL ON TABLE public.calendar_oauth_states TO service_role;
GRANT ALL ON TABLE public.calendar_oauth_states TO postgres;

-- ── 2. Grant metadata (tokens remain service_role only) ─────────────────────

ALTER TABLE public.google_calendar_refresh_tokens
  ADD COLUMN IF NOT EXISTS provider            TEXT NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS google_account_id   TEXT,
  ADD COLUMN IF NOT EXISTS google_email        TEXT,
  ADD COLUMN IF NOT EXISTS scopes              TEXT[],
  ADD COLUMN IF NOT EXISTS reauth_required     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_error          TEXT,
  ADD COLUMN IF NOT EXISTS last_error_code     TEXT,
  ADD COLUMN IF NOT EXISTS connected_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disconnected_at     TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_refresh_tokens_account_active_uidx
  ON public.google_calendar_refresh_tokens (google_account_id)
  WHERE status = 'active'
    AND google_account_id IS NOT NULL
    AND length(btrim(google_account_id)) > 0;

-- ── 3. Interview calendar sync status (no tokens) ───────────────────────────

ALTER TABLE public.scheduled_interviews
  ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS calendar_synced_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_sync_error  TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_interviews_calendar_sync_status_chk'
  ) THEN
    ALTER TABLE public.scheduled_interviews
      ADD CONSTRAINT scheduled_interviews_calendar_sync_status_chk
      CHECK (
        calendar_sync_status IS NULL
        OR calendar_sync_status IN (
          'pending',
          'synced',
          'sync_error',
          'reauth_required',
          'not_connected',
          'cancelled'
        )
      );
  END IF;
END $$;

-- ── 4. has_google_calendar_grant — exclude reauth_required ──────────────────

CREATE OR REPLACE FUNCTION public.has_google_calendar_grant(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.google_calendar_refresh_tokens t
    WHERE t.user_id = p_user_id
      AND t.status = 'active'
      AND COALESCE(t.reauth_required, FALSE) = FALSE
      AND t.refresh_token IS NOT NULL
      AND length(btrim(t.refresh_token)) > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_google_calendar_grant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_google_calendar_grant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.has_google_calendar_grant(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_google_calendar_grant(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_google_calendar_grant(UUID) TO postgres;

-- ── 5. upsert with account metadata (2-arg callers remain valid) ────────────
-- Drop the original 2-arg signature so defaults apply to the same function.

DROP FUNCTION IF EXISTS public.upsert_google_refresh_token(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_google_refresh_token(
  p_user_id UUID,
  p_refresh_token TEXT,
  p_google_account_id TEXT DEFAULT NULL,
  p_google_email TEXT DEFAULT NULL,
  p_scopes TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  other_user UUID;
  already BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  IF p_refresh_token IS NULL OR length(btrim(p_refresh_token)) = 0 THEN
    RAISE EXCEPTION 'p_refresh_token required';
  END IF;

  IF p_google_account_id IS NOT NULL AND length(btrim(p_google_account_id)) > 0 THEN
    SELECT t.user_id INTO other_user
    FROM public.google_calendar_refresh_tokens t
    WHERE t.google_account_id = btrim(p_google_account_id)
      AND t.status = 'active'
      AND t.user_id <> p_user_id
    LIMIT 1;

    IF other_user IS NOT NULL THEN
      RAISE EXCEPTION 'GOOGLE_ACCOUNT_IN_USE' USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.google_calendar_refresh_tokens t
    WHERE t.user_id = p_user_id
      AND t.status = 'active'
      AND t.refresh_token IS NOT NULL
      AND length(btrim(t.refresh_token)) > 0
      AND COALESCE(t.reauth_required, FALSE) = FALSE
  ) INTO already;

  INSERT INTO public.google_calendar_refresh_tokens AS t
    (
      user_id, refresh_token, status, updated_at,
      google_account_id, google_email, scopes,
      reauth_required, last_error, last_error_code,
      connected_at, disconnected_at, provider
    )
  VALUES
    (
      p_user_id, btrim(p_refresh_token), 'active', NOW(),
      NULLIF(btrim(COALESCE(p_google_account_id, '')), ''),
      NULLIF(btrim(COALESCE(p_google_email, '')), ''),
      p_scopes,
      FALSE, NULL, NULL,
      NOW(), NULL, 'google'
    )
  ON CONFLICT (user_id) DO UPDATE
    SET refresh_token      = EXCLUDED.refresh_token,
        status             = 'active',
        google_account_id  = COALESCE(EXCLUDED.google_account_id, t.google_account_id),
        google_email       = COALESCE(EXCLUDED.google_email, t.google_email),
        scopes             = COALESCE(EXCLUDED.scopes, t.scopes),
        reauth_required    = FALSE,
        last_error         = NULL,
        last_error_code    = NULL,
        connected_at       = COALESCE(t.connected_at, NOW()),
        disconnected_at    = NULL,
        updated_at         = NOW();

  RETURN jsonb_build_object('ok', TRUE, 'already_connected', already);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT, TEXT, TEXT, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT, TEXT, TEXT, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT, TEXT, TEXT, TEXT[]) TO postgres;

-- ── 6. clear — keep interviews; drop credentials ────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_google_refresh_token(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.google_calendar_refresh_tokens AS t
    (user_id, refresh_token, status, reauth_required, disconnected_at, updated_at)
  VALUES
    (p_user_id, NULL, 'revoked', FALSE, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET refresh_token     = NULL,
        status            = 'revoked',
        reauth_required   = FALSE,
        last_error        = NULL,
        last_error_code   = NULL,
        disconnected_at   = NOW(),
        updated_at        = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.clear_google_refresh_token(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_google_refresh_token(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.clear_google_refresh_token(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clear_google_refresh_token(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_google_refresh_token(UUID) TO postgres;

-- ── 7. mark reauth (refresh failed / Google revoked) ────────────────────────

CREATE OR REPLACE FUNCTION public.mark_google_calendar_reauth(
  p_user_id UUID,
  p_error_code TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.google_calendar_refresh_tokens
     SET reauth_required = TRUE,
         last_error_code = NULLIF(btrim(COALESCE(p_error_code, '')), ''),
         last_error      = NULLIF(btrim(COALESCE(p_error, '')), ''),
         updated_at      = NOW()
   WHERE user_id = p_user_id
     AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_google_calendar_reauth(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_google_calendar_reauth(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.mark_google_calendar_reauth(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_google_calendar_reauth(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_google_calendar_reauth(UUID, TEXT, TEXT) TO postgres;

-- ── 8. Connection status — never returns tokens ─────────────────────────────
-- Clients: auth.uid() only. Service role: p_user_id after Edge JWT check.

CREATE OR REPLACE FUNCTION public.get_calendar_connection_status(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid UUID;
  rec RECORD;
  connected BOOLEAN;
  status_out TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    uid := p_user_id;
  ELSE
    uid := auth.uid();
  END IF;

  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'connected', FALSE,
      'status', 'unauthenticated',
      'reauth_required', FALSE
    );
  END IF;

  SELECT
    t.status,
    t.reauth_required,
    t.google_email,
    t.scopes,
    t.last_error,
    t.last_error_code,
    t.connected_at,
    t.disconnected_at,
    t.updated_at,
    (t.refresh_token IS NOT NULL AND length(btrim(t.refresh_token)) > 0) AS has_token
  INTO rec
  FROM public.google_calendar_refresh_tokens t
  WHERE t.user_id = uid;

  IF rec IS NULL THEN
    RETURN jsonb_build_object(
      'connected', FALSE,
      'status', 'disconnected',
      'reauth_required', FALSE,
      'google_email', NULL,
      'scopes', NULL,
      'last_error', NULL,
      'last_error_code', NULL,
      'connected_at', NULL,
      'disconnected_at', NULL
    );
  END IF;

  connected := rec.status = 'active'
    AND rec.has_token
    AND COALESCE(rec.reauth_required, FALSE) = FALSE;

  IF connected THEN
    status_out := 'connected';
  ELSIF rec.status = 'active' AND COALESCE(rec.reauth_required, FALSE) THEN
    status_out := 'reauth_required';
  ELSE
    status_out := 'disconnected';
  END IF;

  RETURN jsonb_build_object(
    'connected', connected,
    'status', status_out,
    'reauth_required', COALESCE(rec.reauth_required, FALSE),
    'google_email', rec.google_email,
    'scopes', rec.scopes,
    'last_error', rec.last_error,
    'last_error_code', rec.last_error_code,
    'connected_at', rec.connected_at,
    'disconnected_at', rec.disconnected_at,
    'updated_at', rec.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_calendar_connection_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_calendar_connection_status(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_connection_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_connection_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_calendar_connection_status(UUID) TO postgres;

REVOKE ALL ON TABLE public.google_calendar_refresh_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.google_calendar_refresh_tokens FROM anon;
REVOKE ALL ON TABLE public.google_calendar_refresh_tokens FROM authenticated;
GRANT ALL ON TABLE public.google_calendar_refresh_tokens TO service_role;
GRANT ALL ON TABLE public.google_calendar_refresh_tokens TO postgres;

REVOKE SELECT ON public.calendar_integrations FROM anon;
REVOKE SELECT ON public.calendar_integrations FROM authenticated;
GRANT SELECT (id, user_id, provider, expires_at, created_at)
  ON public.calendar_integrations TO authenticated;
