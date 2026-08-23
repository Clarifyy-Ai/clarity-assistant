-- WS18: Session finalization duration hardening.
--
-- Ordering note: this file must run after the migration that defines
-- public.end_owned_session / public.session_duration_seconds
-- (20260823090000_session_start_eligibility.sql), because it replaces that RPC.
--
-- Additive: allow EXPIRED lifecycle; backfill duration_seconds for rows that a
-- previous client dual-write left null; make idempotent re-end repair duration.

-- 1) Allow EXPIRED — the timeout path already writes it.
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_lifecycle_status_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_lifecycle_status_check
  CHECK (
    lifecycle_status IS NULL OR lifecycle_status = ANY (ARRAY[
      'CREATED'::text,
      'DEVICE_CHECK'::text,
      'READY'::text,
      'IN_PROGRESS'::text,
      'PAUSED'::text,
      'COMPLETED'::text,
      'PROCESSING'::text,
      'ANALYZED'::text,
      'CANCELLED'::text,
      'INTERRUPTED'::text,
      'RECOVERABLE_ERROR'::text,
      'FAILED'::text,
      'EXPIRED'::text
    ])
  );

-- 2) One-shot backfill for ended sessions missing duration_seconds.
UPDATE public.sessions
SET duration_seconds = public.session_duration_seconds(
  COALESCE(started_at, created_at),
  ended_at
)
WHERE duration_seconds IS NULL
  AND ended_at IS NOT NULL
  AND COALESCE(started_at, created_at) IS NOT NULL;

-- 3) end_owned_session: repair duration on the already-terminal path.
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
  v_duration integer;
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

  -- Already terminal: never re-classify, but repair a missing duration so
  -- analytics and the session list are not permanently blank.
  IF v_row.status IN ('completed', 'abandoned') THEN
    IF v_row.duration_seconds IS NULL
       AND v_row.ended_at IS NOT NULL
       AND COALESCE(v_row.started_at, v_row.created_at) IS NOT NULL THEN
      v_duration := public.session_duration_seconds(
        COALESCE(v_row.started_at, v_row.created_at),
        v_row.ended_at
      );
      UPDATE public.sessions
      SET
        duration_seconds = v_duration,
        updated_at = v_now
      WHERE id = v_row.id
        AND user_id = p_user_id
        AND duration_seconds IS NULL
      RETURNING * INTO v_row;
    END IF;

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
        public.session_duration_seconds(
          COALESCE(v_row.started_at, v_row.created_at),
          v_row.ended_at
        )
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
