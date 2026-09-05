-- Preserve mock progress JSON in sessions.notes when finalize metrics omit the marker.

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
  v_incoming_notes text := NULLIF(p_metrics->>'notes', '');
  v_merged_notes text;
BEGIN
  PERFORM public.assert_owned_session_rpc(p_user_id);

  SELECT * INTO v_row
  FROM public.sessions
  WHERE id = p_session_id AND user_id = p_user_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

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

  v_merged_notes := v_incoming_notes;
  IF v_row.notes IS NOT NULL
     AND v_row.notes LIKE '%__clarify_mock_progress__%'
     AND (v_incoming_notes IS NULL OR v_incoming_notes NOT LIKE '%__clarify_mock_progress__%') THEN
    v_merged_notes := v_row.notes;
  END IF;

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
      notes = COALESCE(v_merged_notes, notes),
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
