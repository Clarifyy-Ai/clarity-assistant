-- Allow a new practice session after the previous one ended with the same
-- start idempotency key (same resume/role/company). Double-click / in-flight
-- replay still reuses the open row.

DROP INDEX IF EXISTS public.sessions_start_idempotency_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_start_idempotency_open_uidx
  ON public.sessions (user_id, start_idempotency_key)
  WHERE start_idempotency_key IS NOT NULL
    AND deleted_at IS NULL
    AND status IN ('pending', 'active', 'paused');

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
      AND deleted_at IS NULL
      AND status IN ('pending', 'active', 'paused')
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
        -- Fall through and create a new session.
      ELSE
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
