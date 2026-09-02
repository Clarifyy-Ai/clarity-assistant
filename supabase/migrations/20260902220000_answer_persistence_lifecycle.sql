-- BUG-023: authoritative answer persistence lifecycle across all exam modes.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_owned_test_answer(
  p_test_id uuid,
  p_question_id uuid,
  p_user_answer text,
  p_is_attempted boolean,
  p_is_marked_review boolean,
  p_time_spent_seconds integer,
  p_client_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.mock_tests;
  v_existing public.test_responses;
  v_now timestamptz := clock_timestamp();
  v_client timestamptz := COALESCE(p_client_updated_at, v_now);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_test
    FROM public.mock_tests
   WHERE id = p_test_id
     AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_test.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
  END IF;

  IF v_test.status = 'ABANDONED' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_INVALIDATED');
  END IF;

  IF v_test.status = 'DRAFT' OR v_test.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_STARTED');
  END IF;

  IF v_test.attempt_phase IS NOT NULL
     AND v_test.attempt_phase NOT IN ('ACTIVE', 'PAUSED', 'CONNECTION_LOST', 'RESTORING') THEN
    IF v_test.attempt_phase IN (
      'SUBMITTING', 'SUBMITTED', 'EVALUATING', 'RESULT_AVAILABLE', 'AUTO_SUBMITTED'
    ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
    END IF;
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_INVALIDATED');
  END IF;

  IF v_test.expires_at IS NOT NULL AND v_test.expires_at < v_now - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_EXPIRED');
  END IF;

  SELECT * INTO v_existing
    FROM public.test_responses
   WHERE test_id = p_test_id
     AND question_id = p_question_id
     AND user_id = auth.uid();

  IF FOUND AND v_existing.client_updated_at IS NOT NULL
     AND v_existing.client_updated_at > v_client THEN
    RETURN jsonb_build_object(
      'success', true,
      'stale', true,
      'answer_version', v_existing.answer_version,
      'client_updated_at', v_existing.client_updated_at
    );
  END IF;

  INSERT INTO public.test_responses (
    test_id, user_id, question_id, user_answer, is_attempted, is_marked_review,
    time_spent_seconds, client_updated_at, answer_version, updated_at, answered_at
  ) VALUES (
    p_test_id, auth.uid(), p_question_id, p_user_answer, COALESCE(p_is_attempted, false),
    COALESCE(p_is_marked_review, false), COALESCE(p_time_spent_seconds, 0),
    v_client, 1, v_now, CASE WHEN COALESCE(p_is_attempted, false) THEN v_now ELSE NULL END
  )
  ON CONFLICT (test_id, question_id)
  DO UPDATE SET
    user_answer = EXCLUDED.user_answer,
    is_attempted = EXCLUDED.is_attempted,
    is_marked_review = EXCLUDED.is_marked_review,
    time_spent_seconds = EXCLUDED.time_spent_seconds,
    client_updated_at = EXCLUDED.client_updated_at,
    answer_version = public.test_responses.answer_version + 1,
    updated_at = v_now,
    answered_at = CASE
      WHEN EXCLUDED.is_attempted THEN COALESCE(public.test_responses.answered_at, v_now)
      ELSE public.test_responses.answered_at
    END
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'success', true,
    'stale', false,
    'answer_version', v_existing.answer_version,
    'client_updated_at', v_existing.client_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_owned_test_answer(uuid, uuid, text, boolean, boolean, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_owned_test_answer(uuid, uuid, text, boolean, boolean, integer, timestamptz) TO authenticated, service_role;

COMMIT;
