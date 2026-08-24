-- Atomic, idempotent session finalization.
-- The client may submit artifacts, but the server owns the terminal transition.

ALTER TABLE public.session_transcripts
  ADD COLUMN IF NOT EXISTS sequence integer,
  ADD COLUMN IF NOT EXISTS utterances jsonb,
  ADD COLUMN IF NOT EXISTS timestamp_ms integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_transcripts_final_snapshot
  ON public.session_transcripts(session_id, sequence)
  WHERE sequence = -1;

CREATE OR REPLACE FUNCTION public.finalize_owned_session(
  p_user_id uuid,
  p_session_id uuid,
  p_terminal_reason text DEFAULT 'USER_ENDED',
  p_answers jsonb DEFAULT '[]'::jsonb,
  p_transcript jsonb DEFAULT NULL,
  p_metrics jsonb DEFAULT '{}'::jsonb
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
  v_reason text := COALESCE(NULLIF(p_terminal_reason, ''), 'USER_ENDED');
  v_status public.session_status;
  v_lifecycle text;
  v_ended_at timestamptz;
BEGIN
  PERFORM public.assert_owned_session_rpc(p_user_id);

  SELECT * INTO v_row
  FROM public.sessions
  WHERE id = p_session_id AND user_id = p_user_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

  -- Terminal rows are immutable and are returned for safe retry/idempotency.
  IF v_row.status IN ('completed', 'abandoned') THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_terminal', true, 'session_id', v_row.id,
      'status', v_row.status, 'lifecycle_status', v_row.lifecycle_status,
      'terminal_reason', v_row.terminal_reason, 'ended_at', v_row.ended_at,
      'duration_seconds', v_row.duration_seconds
    );
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= v_now THEN
    v_reason := 'SESSION_TIMEOUT';
  END IF;

  IF v_reason = 'USER_ENDED' THEN
    v_status := 'completed';
    v_lifecycle := 'COMPLETED';
  ELSIF v_reason = 'SESSION_TIMEOUT' THEN
    v_status := 'abandoned';
    v_lifecycle := 'EXPIRED';
  ELSIF v_reason = 'FAILED' THEN
    v_status := 'abandoned';
    v_lifecycle := 'FAILED';
  ELSE
    v_status := 'abandoned';
    v_lifecycle := 'CANCELLED';
  END IF;

  v_ended_at := v_now;

  -- Artifacts and metrics are written in this transaction, before the
  -- terminal session row is committed.
  INSERT INTO public.session_answers (
    session_id, user_id, question, answer, duration_ms, question_index
  )
  SELECT p_session_id, p_user_id, x.question, x.answer, x.duration_ms, x.question_index
  FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(p_answers) = 'array' THEN p_answers ELSE '[]'::jsonb END)
    AS x(question text, answer text, duration_ms integer, question_index integer)
  WHERE x.question_index IS NOT NULL
  ON CONFLICT (session_id, user_id, question_index) DO UPDATE SET
    question = EXCLUDED.question,
    answer = EXCLUDED.answer,
    duration_ms = EXCLUDED.duration_ms;

  IF p_transcript IS NOT NULL
     AND COALESCE(p_transcript->>'content', '') <> '' THEN
    INSERT INTO public.session_transcripts (
      session_id, user_id, content, utterances, sequence
    )
    VALUES (
      p_session_id, p_user_id, p_transcript->>'content',
      COALESCE(p_transcript->'utterances', '[]'::jsonb), -1
    )
    ON CONFLICT (session_id, sequence) WHERE sequence = -1 DO UPDATE SET
      content = EXCLUDED.content,
      utterances = EXCLUDED.utterances;
  END IF;

  UPDATE public.sessions
  SET status = v_status,
      lifecycle_status = v_lifecycle,
      terminal_reason = COALESCE(terminal_reason, v_reason),
      ended_at = COALESCE(ended_at, v_ended_at),
      duration_seconds = public.session_duration_seconds(
        COALESCE(started_at, created_at), COALESCE(ended_at, v_ended_at)
      ),
      credits_used = COALESCE((p_metrics->>'credits_used')::integer, credits_used),
      model_used = COALESCE(NULLIF(p_metrics->>'model_used', '')::public.ai_model, model_used),
      filler_words = COALESCE((p_metrics->>'filler_words')::integer, filler_words),
      avg_wpm = COALESCE((p_metrics->>'avg_wpm')::numeric, avg_wpm),
      hints_used = COALESCE((p_metrics->>'hints_used')::integer, hints_used),
      answers_generated = COALESCE((p_metrics->>'answers_generated')::integer, answers_generated),
      questions_asked = COALESCE((p_metrics->>'questions_asked')::integer, questions_asked),
      notes = COALESCE(p_metrics->>'notes', notes),
      updated_at = v_now
  WHERE id = p_session_id AND user_id = p_user_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true, 'already_terminal', false, 'session_id', v_row.id,
    'status', v_row.status, 'lifecycle_status', v_row.lifecycle_status,
    'terminal_reason', v_row.terminal_reason, 'ended_at', v_row.ended_at,
    'duration_seconds', v_row.duration_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_owned_session(uuid, uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_owned_session(uuid, uuid, text, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_owned_session(uuid, uuid, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_owned_session(uuid, uuid, text, jsonb, jsonb, jsonb) TO service_role;

-- Prevent legacy authenticated clients from forging a terminal session.
-- SECURITY DEFINER lifecycle RPCs run as the function owner and remain allowed.
CREATE OR REPLACE FUNCTION public.prevent_client_terminal_session_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'postgres' AND auth.uid() IS NOT NULL
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
       OR NEW.terminal_reason IS DISTINCT FROM OLD.terminal_reason
       OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
     )
  THEN
  IF OLD.status IN ('completed', 'abandoned')
     OR OLD.lifecycle_status IN ('COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED')
     OR NEW.status IN ('completed', 'abandoned')
     OR NEW.lifecycle_status IN ('COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED')
     OR NEW.terminal_reason IS DISTINCT FROM OLD.terminal_reason
     OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
    THEN
      RAISE EXCEPTION 'Terminal session fields are server-authoritative'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_terminal_mutation_guard ON public.sessions;
CREATE TRIGGER sessions_terminal_mutation_guard
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_terminal_session_mutation();
