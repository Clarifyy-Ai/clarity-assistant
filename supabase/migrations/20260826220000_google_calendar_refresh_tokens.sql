-- Secure Google Calendar refresh-token store + service_role RPCs.
-- Used by sync-calendar (get_google_refresh_token) and connect/disconnect flows.
-- Tokens are never readable by anon/authenticated clients.

CREATE TABLE IF NOT EXISTS public.google_calendar_refresh_tokens (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'revoked')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT google_calendar_refresh_tokens_active_has_token
    CHECK (
      (status = 'active' AND refresh_token IS NOT NULL AND length(btrim(refresh_token)) > 0)
      OR status = 'revoked'
    )
);

COMMENT ON TABLE public.google_calendar_refresh_tokens IS
  'Server-only Google Calendar OAuth refresh tokens. Access via get_google_refresh_token / upsert_google_refresh_token (service_role).';

ALTER TABLE public.google_calendar_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- No client policies — service_role bypasses RLS; deny everyone else by default.
REVOKE ALL ON TABLE public.google_calendar_refresh_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.google_calendar_refresh_tokens FROM anon;
REVOKE ALL ON TABLE public.google_calendar_refresh_tokens FROM authenticated;
GRANT ALL ON TABLE public.google_calendar_refresh_tokens TO service_role;
GRANT ALL ON TABLE public.google_calendar_refresh_tokens TO postgres;

-- ── get_google_refresh_token ──────────────────────────────────────────────────
-- Returns { refresh_token: text } or empty object when missing/revoked.
CREATE OR REPLACE FUNCTION public.get_google_refresh_token(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tok TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT t.refresh_token INTO tok
  FROM public.google_calendar_refresh_tokens t
  WHERE t.user_id = p_user_id
    AND t.status = 'active'
    AND t.refresh_token IS NOT NULL
    AND length(btrim(t.refresh_token)) > 0;

  IF tok IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object('refresh_token', tok);
END;
$$;

REVOKE ALL ON FUNCTION public.get_google_refresh_token(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_google_refresh_token(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_google_refresh_token(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_google_refresh_token(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_google_refresh_token(UUID) TO postgres;

-- ── upsert_google_refresh_token ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_google_refresh_token(
  p_user_id UUID,
  p_refresh_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  IF p_refresh_token IS NULL OR length(btrim(p_refresh_token)) = 0 THEN
    RAISE EXCEPTION 'p_refresh_token required';
  END IF;

  INSERT INTO public.google_calendar_refresh_tokens AS t
    (user_id, refresh_token, status, updated_at)
  VALUES
    (p_user_id, btrim(p_refresh_token), 'active', NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET refresh_token = EXCLUDED.refresh_token,
        status        = 'active',
        updated_at    = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_google_refresh_token(UUID, TEXT) TO postgres;

-- ── clear_google_refresh_token (soft disconnect) ─────────────────────────────
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
    (user_id, refresh_token, status, updated_at)
  VALUES
    (p_user_id, NULL, 'revoked', NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET refresh_token = NULL,
        status        = 'revoked',
        updated_at    = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.clear_google_refresh_token(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_google_refresh_token(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.clear_google_refresh_token(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clear_google_refresh_token(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_google_refresh_token(UUID) TO postgres;

-- ── has_google_calendar_grant (connection probe without exposing token) ───────
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
