-- Session start eligibility + authoritative lifecycle.
-- Additive: new columns, RPCs, and indexes. Does not rewrite history.

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_reason text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS start_idempotency_key text;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_duration_seconds_nonnegative;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_duration_seconds_nonnegative
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_terminal_reason_known;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_terminal_reason_known
  CHECK (
    terminal_reason IS NULL OR terminal_reason IN (
      'USER_ENDED',
      'SESSION_TIMEOUT',
      'AUTH_EXPIRED',
      'DAILY_LIMIT_REACHED',
      'CREDITS_EXHAUSTED',
      'PROVIDER_UNAVAILABLE',
      'ACCOUNT_RESTRICTED',
      'SYSTEM_ERROR',
      'CANCELLED',
      'FAILED'
    )
  );

COMMENT ON COLUMN public.sessions.expires_at IS
  'Server-authoritative practice-session expiry. Independent of auth JWT expiry.';
COMMENT ON COLUMN public.sessions.terminal_reason IS
  'Why the session reached a terminal state. Never overwritten once set.';
COMMENT ON COLUMN public.sessions.duration_seconds IS
  'Authoritative duration: GREATEST(0, ended_at - started_at) in seconds.';

-- Open rows keep the existing 24h stale-session window so in-flight sessions
-- are not mass-expired by the new 5-minute free-tier duration rule.
UPDATE public.sessions
SET expires_at = COALESCE(started_at, created_at) + INTERVAL '24 hours'
WHERE expires_at IS NULL
  AND status IN ('pending', 'active', 'paused')
  AND deleted_at IS NULL;

UPDATE public.sessions
SET duration_seconds = GREATEST(
  0,
  FLOOR(EXTRACT(EPOCH FROM (ended_at - started_at)))::integer
)
WHERE duration_seconds IS NULL
  AND started_at IS NOT NULL
  AND ended_at IS NOT NULL;

-- One active/pending/paused session per user+type (product rule in start-session).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type
      ORDER BY created_at DESC
    ) AS rn
  FROM public.sessions
  WHERE status IN ('pending', 'active', 'paused')
    AND deleted_at IS NULL
)
UPDATE public.sessions s
SET
  status = 'abandoned',
  lifecycle_status = COALESCE(s.lifecycle_status, 'CANCELLED'),
  terminal_reason = COALESCE(s.terminal_reason, 'SYSTEM_ERROR'),
  ended_at = COALESCE(s.ended_at, now()),
  duration_seconds = COALESCE(
    s.duration_seconds,
    GREATEST(
      0,
      FLOOR(
        EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - COALESCE(s.started_at, s.created_at)))
      )::integer
    )
  ),
  updated_at = now()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open_per_type_uidx
  ON public.sessions (user_id, type)
  WHERE status IN ('pending', 'active', 'paused')
    AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_start_idempotency_uidx
  ON public.sessions (user_id, start_idempotency_key)
  WHERE start_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_user_open_created_idx
  ON public.sessions (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── Caller guard ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_owned_session_rpc(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot access another user''s session eligibility'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_owned_session_rpc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_owned_session_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_owned_session_rpc(uuid) TO service_role;

-- UTC calendar-day window matching start-session Edge (not rolling 24h).
CREATE OR REPLACE FUNCTION public.session_utc_day_start(p_now timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('day', p_now AT TIME ZONE 'utc') AT TIME ZONE 'utc';
$$;

REVOKE ALL ON FUNCTION public.session_utc_day_start(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_utc_day_start(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_utc_day_start(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.session_duration_seconds(
  p_started_at timestamptz,
  p_ended_at timestamptz
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_started_at IS NULL OR p_ended_at IS NULL THEN 0
    ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_ended_at - p_started_at)))::integer)
  END;
$$;

REVOKE ALL ON FUNCTION public.session_duration_seconds(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_duration_seconds(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_duration_seconds(timestamptz, timestamptz) TO service_role;

-- ── Eligibility (read-only; Edge/provider/auth wrap this) ────────────────────
-- Counts every session created in the UTC calendar day (including abandoned,
-- failed, cancelled, and active). Matches existing start-session Edge behavior.
CREATE OR REPLACE FUNCTION public.session_start_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_credits integer;
  v_banned boolean;
  v_used integer;
  v_limit integer := 3;
  v_day_start timestamptz;
  v_reset_at timestamptz;
  v_free boolean;
BEGIN
  PERFORM public.assert_owned_session_rpc(p_user_id);

  v_day_start := public.session_utc_day_start(now());
  v_reset_at := v_day_start + INTERVAL '1 day';

  SELECT plan_id, credits, COALESCE(is_banned, false)
  INTO v_plan, v_credits, v_banned
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'ACCOUNT_RESTRICTED',
      'used', 0,
      'limit', v_limit,
      'reset_at', v_reset_at,
      'upgrade_available', true
    );
  END IF;

  IF v_banned THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'ACCOUNT_RESTRICTED',
      'used', 0,
      'limit', v_limit,
      'reset_at', v_reset_at,
      'upgrade_available', false
    );
  END IF;

  v_free := (v_plan IS NULL OR v_plan = 'free');

  SELECT COUNT(*)::integer
  INTO v_used
  FROM public.sessions
  WHERE user_id = p_user_id
    AND created_at >= v_day_start;

  IF v_free AND v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'DAILY_LIMIT_REACHED',
      'used', v_used,
      'limit', v_limit,
      'reset_at', v_reset_at,
      'upgrade_available', true
    );
  END IF;

  IF v_free AND COALESCE(v_credits, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'CREDITS_EXHAUSTED',
      'used', v_used,
      'limit', v_limit,
      'reset_at', v_reset_at,
      'upgrade_available', true,
      'credits', COALESCE(v_credits, 0)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'ALLOWED',
    'used', v_used,
    'limit', CASE WHEN v_free THEN v_limit ELSE NULL END,
    'reset_at', v_reset_at,
    'upgrade_available', v_free,
    'credits', COALESCE(v_credits, 0),
    'plan_id', COALESCE(v_plan, 'free')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.session_start_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.session_start_eligibility(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.session_start_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_start_eligibility(uuid) TO service_role;

-- Keep the legacy RPC as a compatibility wrapper with the same UTC-day rule.
CREATE OR REPLACE FUNCTION public.check_free_tier_limits(p_user_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_elig jsonb;
  v_reason text;
  v_documents integer;
  v_plan text;
BEGIN
  PERFORM public.assert_owned_session_rpc(p_user_id);

  IF p_action = 'start_session' THEN
    v_elig := public.session_start_eligibility(p_user_id);
    v_reason := v_elig->>'reason';
    IF (v_elig->>'allowed')::boolean THEN
      RETURN jsonb_build_object('allowed', true, 'reason', 'ALLOWED');
    END IF;
    IF v_reason = 'DAILY_LIMIT_REACHED' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'daily_session_limit',
        'message', format(
          'Free plan allows %s sessions per day. Upgrade to Pro for unlimited sessions.',
          COALESCE(v_elig->>'limit', '3')
        ),
        'used', v_elig->'used',
        'limit', v_elig->'limit',
        'reset_at', v_elig->>'reset_at',
        'upgrade_available', v_elig->'upgrade_available'
      );
    END IF;
    IF v_reason = 'CREDITS_EXHAUSTED' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'no_credits',
        'message', 'You have no credits remaining. Upgrade to Pro for 2,000 credits/month.',
        'used', v_elig->'used',
        'limit', v_elig->'limit',
        'reset_at', v_elig->>'reset_at',
        'upgrade_available', v_elig->'upgrade_available'
      );
    END IF;
    IF v_reason = 'ACCOUNT_RESTRICTED' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'account_restricted',
        'message', 'This account cannot start a session right now.'
      );
    END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', lower(v_reason),
      'message', 'Session cannot be started.'
    );
  END IF;

  SELECT plan_id INTO v_plan FROM public.profiles WHERE id = p_user_id;
  IF v_plan IS NOT NULL AND v_plan <> 'free' THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  IF p_action = 'upload_document' THEN
    SELECT COUNT(*) INTO v_documents
    FROM public.documents
    WHERE user_id = p_user_id AND deleted_at IS NULL;
    IF v_documents >= 5 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'document_limit',
        'message', 'Free plan allows 5 documents. Upgrade to Pro for unlimited storage.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- ── Atomic start (lock + eligibility + insert or restore) ────────────────────
CREATE OR REPLACE FUNCTION public.start_owned_session(
  p_user_id uuid,
  p_type text,
  p_title text DEFAULT NULL,
  p_document_id uuid DEFAULT NULL,
  p_jd_id uuid DEFAULT NULL,
  p_model_used text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_practice_context_id uuid DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_duration_minutes integer DEFAULT 5,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_elig jsonb;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_duration integer;
  v_existing public.sessions%ROWTYPE;
  v_created public.sessions%ROWTYPE;
  v_type public.session_type;
  v_model public.ai_model;
BEGIN
  PERFORM public.assert_owned_session_rpc(p_user_id);
  PERFORM pg_advisory_xact_lock(hashtext('session-start:' || p_user_id::text));

  v_duration := GREATEST(5, LEAST(COALESCE(p_duration_minutes, 5), 60));
  v_expires := v_now + make_interval(mins => v_duration);

  BEGIN
    v_type := p_type::public.session_type;
  EXCEPTION WHEN invalid_text_representation THEN
    v_type := 'mock';
  END;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.sessions
    WHERE user_id = p_user_id
      AND start_idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'allowed', true,
        'reason', 'ALLOWED',
        'session_id', v_existing.id,
        'reused', true,
        'started_at', COALESCE(v_existing.started_at, v_existing.created_at),
        'expires_at', v_existing.expires_at,
        'status', v_existing.status,
        'lifecycle_status', v_existing.lifecycle_status,
        'terminal_reason', v_existing.terminal_reason
      );
    END IF;
  END IF;

  -- Restore an open session of this type instead of creating a duplicate.
  SELECT * INTO v_existing
  FROM public.sessions
  WHERE user_id = p_user_id
    AND type = v_type
    AND status IN ('pending', 'active', 'paused')
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.expires_at IS NOT NULL AND v_existing.expires_at <= v_now THEN
      UPDATE public.sessions
      SET
        status = 'abandoned',
        lifecycle_status = 'EXPIRED',
        terminal_reason = COALESCE(terminal_reason, 'SESSION_TIMEOUT'),
        ended_at = COALESCE(ended_at, v_now),
        duration_seconds = public.session_duration_seconds(
          COALESCE(started_at, created_at),
          COALESCE(ended_at, v_now)
        ),
        updated_at = v_now
      WHERE id = v_existing.id
        AND user_id = p_user_id
        AND status IN ('pending', 'active', 'paused');
    ELSE
      UPDATE public.sessions
      SET
        status = 'active',
        lifecycle_status = 'IN_PROGRESS',
        started_at = COALESCE(started_at, v_now),
        expires_at = COALESCE(expires_at, v_expires),
        updated_at = v_now
      WHERE id = v_existing.id
        AND user_id = p_user_id
      RETURNING * INTO v_existing;

      RETURN jsonb_build_object(
        'ok', true,
        'allowed', true,
        'reason', 'ALLOWED',
        'session_id', v_existing.id,
        'reused', true,
        'started_at', COALESCE(v_existing.started_at, v_now),
        'expires_at', v_existing.expires_at,
        'status', v_existing.status,
        'lifecycle_status', v_existing.lifecycle_status,
        'terminal_reason', v_existing.terminal_reason
      );
    END IF;
  END IF;

  v_elig := public.session_start_eligibility(p_user_id);
  IF NOT (v_elig->>'allowed')::boolean THEN
    RETURN jsonb_build_object(
      'ok', false,
      'allowed', false,
      'reason', v_elig->>'reason',
      'used', v_elig->'used',
      'limit', v_elig->'limit',
      'reset_at', v_elig->>'reset_at',
      'upgrade_available', v_elig->'upgrade_available'
    );
  END IF;

  BEGIN
    v_model := NULLIF(p_model_used, '')::public.ai_model;
  EXCEPTION WHEN invalid_text_representation THEN
    v_model := 'gemini-1-5-flash';
  END;

  INSERT INTO public.sessions (
    user_id,
    type,
    status,
    lifecycle_status,
    title,
    document_id,
    jd_id,
    model_used,
    tags,
    practice_context_id,
    source_type,
    started_at,
    ended_at,
    expires_at,
    start_idempotency_key,
    updated_at
  ) VALUES (
    p_user_id,
    v_type,
    'active',
    'IN_PROGRESS',
    p_title,
    p_document_id,
    p_jd_id,
    v_model,
    p_tags,
    p_practice_context_id,
    p_source_type,
    v_now,
    NULL,
    v_expires,
    p_idempotency_key,
    v_now
  )
  RETURNING * INTO v_created;

  RETURN jsonb_build_object(
    'ok', true,
    'allowed', true,
    'reason', 'ALLOWED',
    'session_id', v_created.id,
    'reused', false,
    'started_at', v_created.started_at,
    'expires_at', v_created.expires_at,
    'status', v_created.status,
    'lifecycle_status', v_created.lifecycle_status,
    'used', v_elig->'used',
    'limit', v_elig->'limit',
    'reset_at', v_elig->>'reset_at'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_owned_session(uuid, text, text, uuid, uuid, text, text[], uuid, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_owned_session(uuid, text, text, uuid, uuid, text, text[], uuid, text, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_owned_session(uuid, text, text, uuid, uuid, text, text[], uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_owned_session(uuid, text, text, uuid, uuid, text, text[], uuid, text, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.end_owned_session(
  p_user_id uuid,
  p_session_id uuid,
  p_terminal_reason text DEFAULT 'USER_ENDED',
  p_lifecycle_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sessions%ROWTYPE;
  v_now timestamptz := now();
  v_reason text;
  v_life text;
  v_status public.session_status;
BEGIN
  PERFORM public.assert_owned_session_rpc(p_user_id);

  v_reason := COALESCE(NULLIF(p_terminal_reason, ''), 'USER_ENDED');
  IF v_reason NOT IN (
    'USER_ENDED', 'SESSION_TIMEOUT', 'AUTH_EXPIRED', 'DAILY_LIMIT_REACHED',
    'CREDITS_EXHAUSTED', 'PROVIDER_UNAVAILABLE', 'ACCOUNT_RESTRICTED',
    'SYSTEM_ERROR', 'CANCELLED', 'FAILED'
  ) THEN
    v_reason := 'SYSTEM_ERROR';
  END IF;

  SELECT * INTO v_row
  FROM public.sessions
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

  IF v_row.status IN ('completed', 'abandoned') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_terminal', true,
      'session_id', v_row.id,
      'status', v_row.status,
      'lifecycle_status', v_row.lifecycle_status,
      'terminal_reason', v_row.terminal_reason,
      'ended_at', v_row.ended_at,
      'duration_seconds', COALESCE(
        v_row.duration_seconds,
        public.session_duration_seconds(v_row.started_at, v_row.ended_at)
      )
    );
  END IF;

  IF v_reason = 'USER_ENDED' THEN
    v_status := 'completed';
    v_life := COALESCE(NULLIF(p_lifecycle_status, ''), 'COMPLETED');
  ELSIF v_reason = 'SESSION_TIMEOUT' THEN
    v_status := 'abandoned';
    v_life := COALESCE(NULLIF(p_lifecycle_status, ''), 'EXPIRED');
  ELSIF v_reason IN ('CANCELLED', 'AUTH_EXPIRED') THEN
    v_status := 'abandoned';
    v_life := COALESCE(NULLIF(p_lifecycle_status, ''), 'CANCELLED');
  ELSIF v_reason = 'FAILED' THEN
    v_status := 'abandoned';
    v_life := COALESCE(NULLIF(p_lifecycle_status, ''), 'FAILED');
  ELSE
    v_status := 'abandoned';
    v_life := COALESCE(NULLIF(p_lifecycle_status, ''), 'CANCELLED');
  END IF;

  UPDATE public.sessions
  SET
    status = v_status,
    lifecycle_status = v_life,
    terminal_reason = COALESCE(terminal_reason, v_reason),
    ended_at = COALESCE(ended_at, v_now),
    duration_seconds = public.session_duration_seconds(
      COALESCE(started_at, created_at),
      COALESCE(ended_at, v_now)
    ),
    updated_at = v_now
  WHERE id = p_session_id
    AND user_id = p_user_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'already_terminal', false,
    'session_id', v_row.id,
    'status', v_row.status,
    'lifecycle_status', v_row.lifecycle_status,
    'terminal_reason', v_row.terminal_reason,
    'ended_at', v_row.ended_at,
    'duration_seconds', v_row.duration_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.end_owned_session(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.end_owned_session(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.end_owned_session(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_owned_session(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_owned_session(
  p_user_id uuid,
  p_session_id uuid DEFAULT NULL,
  p_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sessions%ROWTYPE;
  v_now timestamptz := now();
  v_type public.session_type;
BEGIN
  PERFORM public.assert_owned_session_rpc(p_user_id);

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.sessions
    WHERE id = p_session_id
      AND user_id = p_user_id
      AND deleted_at IS NULL;
  ELSE
    BEGIN
      v_type := NULLIF(p_type, '')::public.session_type;
    EXCEPTION WHEN invalid_text_representation THEN
      v_type := NULL;
    END;
    SELECT * INTO v_row
    FROM public.sessions
    WHERE user_id = p_user_id
      AND deleted_at IS NULL
      AND (v_type IS NULL OR type = v_type)
      AND status IN ('pending', 'active', 'paused')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'found', false, 'reason', 'NONE');
  END IF;

  IF v_row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'FORBIDDEN');
  END IF;

  IF v_row.status IN ('completed', 'abandoned') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'found', true,
      'session_id', v_row.id,
      'status', v_row.status,
      'lifecycle_status', v_row.lifecycle_status,
      'terminal_reason', v_row.terminal_reason,
      'expires_at', v_row.expires_at,
      'reason', CASE
        WHEN v_row.lifecycle_status = 'EXPIRED' OR v_row.terminal_reason = 'SESSION_TIMEOUT'
          THEN 'SESSION_EXPIRED'
        ELSE 'ENDED'
      END
    );
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= v_now THEN
    RETURN public.end_owned_session(p_user_id, v_row.id, 'SESSION_TIMEOUT', 'EXPIRED')
      || jsonb_build_object('found', true, 'reason', 'SESSION_EXPIRED', 'expired', true);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'reason', 'ACTIVE',
    'session_id', v_row.id,
    'status', v_row.status,
    'lifecycle_status', v_row.lifecycle_status,
    'started_at', v_row.started_at,
    'expires_at', v_row.expires_at,
    'type', v_row.type,
    'title', v_row.title,
    'terminal_reason', v_row.terminal_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_owned_session(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_owned_session(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_owned_session(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_owned_session(uuid, uuid, text) TO service_role;
