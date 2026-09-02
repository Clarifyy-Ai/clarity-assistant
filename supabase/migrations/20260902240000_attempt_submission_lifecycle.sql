-- Atomic mock-test lifecycle: versioned saves, submission claim, and terminal result.
BEGIN;

ALTER TABLE public.revision_list
  ADD COLUMN IF NOT EXISTS question_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.start_owned_mock_test(p_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.mock_tests;
  v_now timestamptz := clock_timestamp();
  v_expires timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;
  SELECT * INTO v_test FROM public.mock_tests
   WHERE id = p_test_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  IF v_test.status IN ('COMPLETED', 'ABANDONED')
     OR v_test.attempt_phase IN ('SUBMITTING', 'SUBMITTED', 'EVALUATING', 'RESULT_AVAILABLE', 'AUTO_SUBMITTED', 'INVALIDATED') THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
  END IF;
  IF v_test.status = 'IN_PROGRESS' AND v_test.started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'already_started', true, 'started_at', v_test.started_at,
      'expires_at', v_test.expires_at, 'status', v_test.status,
      'attempt_phase', COALESCE(v_test.attempt_phase, 'ACTIVE')
    );
  END IF;
  v_expires := CASE WHEN COALESCE(v_test.time_limit_minutes, 0) > 0
    THEN v_now + make_interval(mins => v_test.time_limit_minutes) ELSE NULL END;
  UPDATE public.mock_tests SET
    status = 'IN_PROGRESS', attempt_phase = 'ACTIVE', started_at = v_now,
    expires_at = v_expires, updated_at = v_now
  WHERE id = p_test_id AND user_id = auth.uid() AND status = 'DRAFT';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT'); END IF;
  RETURN jsonb_build_object(
    'success', true, 'already_started', false, 'started_at', v_now,
    'expires_at', v_expires, 'status', 'IN_PROGRESS', 'attempt_phase', 'ACTIVE'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_owned_mock_test(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_owned_mock_test(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.save_owned_test_answer(
  uuid, uuid, text, boolean, boolean, integer, timestamptz, integer
);
DROP FUNCTION IF EXISTS public.save_owned_test_answer(
  uuid, uuid, text, boolean, boolean, integer, timestamptz
);

CREATE OR REPLACE FUNCTION public.save_owned_test_answer(
  p_test_id uuid,
  p_question_id uuid,
  p_user_answer text,
  p_is_attempted boolean,
  p_is_marked_review boolean,
  p_time_spent_seconds integer,
  p_client_updated_at timestamptz,
  p_expected_version integer DEFAULT NULL
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
   WHERE id = p_test_id AND user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;
  IF NOT (p_question_id::text = ANY(COALESCE(v_test.question_ids, ARRAY[]::text[]))) THEN
    RETURN jsonb_build_object('success', false, 'code', 'QUESTION_NOT_IN_ATTEMPT');
  END IF;
  IF v_test.status = 'ABANDONED' OR v_test.attempt_phase = 'INVALIDATED' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_INVALIDATED');
  END IF;
  IF v_test.status = 'COMPLETED'
     OR v_test.attempt_phase IN ('SUBMITTING', 'SUBMITTED', 'EVALUATING', 'RESULT_AVAILABLE', 'AUTO_SUBMITTED') THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
  END IF;
  IF v_test.status <> 'IN_PROGRESS' OR v_test.started_at IS NULL
     OR COALESCE(v_test.attempt_phase, 'ACTIVE') NOT IN ('ACTIVE', 'PAUSED', 'CONNECTION_LOST', 'RESTORING') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_STARTED');
  END IF;
  IF v_test.expires_at IS NOT NULL AND v_test.expires_at < v_now - interval '2 seconds' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_EXPIRED');
  END IF;
  IF v_client > v_now + interval '5 minutes' OR v_client < v_test.started_at - interval '5 minutes' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CLIENT_CLOCK_INVALID');
  END IF;

  SELECT * INTO v_existing
    FROM public.test_responses
   WHERE test_id = p_test_id AND question_id = p_question_id AND user_id = auth.uid()
   FOR UPDATE;

  IF FOUND AND (
    (p_expected_version IS NOT NULL AND p_expected_version <> COALESCE(v_existing.answer_version, 0))
    OR (p_expected_version IS NULL AND v_existing.client_updated_at IS NOT NULL
        AND v_existing.client_updated_at > v_client)
  ) THEN
    RETURN jsonb_build_object(
      'success', true, 'stale', true, 'code', 'VERSION_CONFLICT',
      'answer_version', COALESCE(v_existing.answer_version, 0),
      'client_updated_at', v_existing.client_updated_at
    );
  END IF;

  INSERT INTO public.test_responses (
    test_id, user_id, question_id, user_answer, is_attempted, is_marked_review,
    time_spent_seconds, client_updated_at, answer_version, updated_at, answered_at
  ) VALUES (
    p_test_id, auth.uid(), p_question_id, NULLIF(p_user_answer, ''),
    COALESCE(p_is_attempted, false), COALESCE(p_is_marked_review, false),
    GREATEST(0, COALESCE(p_time_spent_seconds, 0)), v_client, 1, v_now,
    CASE WHEN COALESCE(p_is_attempted, false) THEN v_now ELSE NULL END
  )
  ON CONFLICT (test_id, question_id) DO UPDATE SET
    user_answer = EXCLUDED.user_answer,
    is_attempted = EXCLUDED.is_attempted,
    is_marked_review = EXCLUDED.is_marked_review,
    time_spent_seconds = GREATEST(public.test_responses.time_spent_seconds, EXCLUDED.time_spent_seconds),
    client_updated_at = EXCLUDED.client_updated_at,
    answer_version = public.test_responses.answer_version + 1,
    updated_at = v_now,
    answered_at = CASE WHEN EXCLUDED.is_attempted
      THEN COALESCE(public.test_responses.answered_at, v_now)
      ELSE public.test_responses.answered_at END
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'success', true, 'stale', false,
    'answer_version', v_existing.answer_version,
    'client_updated_at', v_existing.client_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_owned_test_answer(
  uuid, uuid, text, boolean, boolean, integer, timestamptz, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_owned_test_answer(
  uuid, uuid, text, boolean, boolean, integer, timestamptz, integer
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.begin_test_submission(p_test_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_test public.mock_tests;
BEGIN
  SELECT * INTO v_test FROM public.mock_tests
   WHERE id = p_test_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  IF v_test.status = 'COMPLETED' OR v_test.attempt_phase = 'RESULT_AVAILABLE' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;
  IF v_test.attempt_phase = 'SUBMITTING' THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_IN_PROGRESS');
  END IF;
  IF v_test.status <> 'IN_PROGRESS' OR v_test.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_STARTED');
  END IF;
  IF COALESCE(v_test.attempt_phase, 'ACTIVE') NOT IN
     ('ACTIVE', 'PAUSED', 'CONNECTION_LOST', 'RESTORING') THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT');
  END IF;
  UPDATE public.mock_tests SET attempt_phase = 'SUBMITTING', updated_at = clock_timestamp()
   WHERE id = p_test_id AND user_id = p_user_id;
  RETURN jsonb_build_object('success', true, 'already_completed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_test_submission(p_test_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.mock_tests
     SET attempt_phase = 'ACTIVE', updated_at = clock_timestamp()
   WHERE id = p_test_id AND user_id = p_user_id
     AND status = 'IN_PROGRESS' AND attempt_phase = 'SUBMITTING'
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.begin_test_submission(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_test_submission(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_test_submission(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_test_submission(uuid, uuid) TO service_role;

-- Completion remains idempotent, but only the holder of the SUBMITTING claim can finalize.
CREATE OR REPLACE FUNCTION public.claim_and_complete_test(
  p_test_id uuid, p_user_id uuid, p_total_score numeric, p_max_score numeric,
  p_accuracy integer, p_attempt_percentage integer, p_subject_breakdown jsonb,
  p_topic_breakdown jsonb, p_weak_topics text[], p_strong_topics text[],
  p_time_analysis jsonb, p_predicted_percentile integer,
  p_responses jsonb DEFAULT '[]'::jsonb,
  p_algorithm_version text DEFAULT 'mock_test_score_v2'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_test public.mock_tests; v_row jsonb;
BEGIN
  SELECT * INTO v_test FROM public.mock_tests
   WHERE id = p_test_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Test not found or access denied'); END IF;
  IF v_test.status = 'COMPLETED' OR v_test.attempt_phase = 'RESULT_AVAILABLE' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;
  IF v_test.attempt_phase <> 'SUBMITTING' THEN
    RETURN jsonb_build_object('error', 'Submission claim required', 'code', 'SUBMISSION_CLAIM_REQUIRED');
  END IF;

  IF jsonb_typeof(p_responses) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_responses) LOOP
      INSERT INTO public.test_responses (
        test_id, user_id, question_id, user_answer, is_attempted, is_correct,
        is_marked_review, time_spent_seconds, answer_version, updated_at
      ) VALUES (
        p_test_id, p_user_id, (v_row->>'question_id')::uuid, NULL,
        COALESCE((v_row->>'is_attempted')::boolean, false),
        COALESCE((v_row->>'is_correct')::boolean, false), false,
        COALESCE(NULLIF(v_row->>'time_spent_seconds', '')::integer, 0), 0,
        clock_timestamp()
      )
      ON CONFLICT (test_id, question_id) DO UPDATE SET
        is_attempted = EXCLUDED.is_attempted,
        is_correct = EXCLUDED.is_correct,
        time_spent_seconds = EXCLUDED.time_spent_seconds,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  END IF;

  INSERT INTO public.test_analyses (
    test_id, user_id, total_score, max_score, accuracy, attempt_percentage,
    subject_breakdown, topic_breakdown, weak_topics, strong_topics, time_analysis,
    predicted_percentile, algorithm_version
  ) VALUES (
    p_test_id, p_user_id, p_total_score, p_max_score, p_accuracy, p_attempt_percentage,
    p_subject_breakdown, p_topic_breakdown, p_weak_topics, p_strong_topics,
    p_time_analysis, p_predicted_percentile, p_algorithm_version
  )
  ON CONFLICT (test_id) DO UPDATE SET
    total_score = EXCLUDED.total_score, max_score = EXCLUDED.max_score,
    accuracy = EXCLUDED.accuracy, attempt_percentage = EXCLUDED.attempt_percentage,
    subject_breakdown = EXCLUDED.subject_breakdown, topic_breakdown = EXCLUDED.topic_breakdown,
    weak_topics = EXCLUDED.weak_topics, strong_topics = EXCLUDED.strong_topics,
    time_analysis = EXCLUDED.time_analysis, predicted_percentile = EXCLUDED.predicted_percentile,
    algorithm_version = EXCLUDED.algorithm_version;

  UPDATE public.mock_tests SET
    status = 'COMPLETED', attempt_phase = 'RESULT_AVAILABLE',
    submitted_at = COALESCE(submitted_at, clock_timestamp()),
    overall_score = p_total_score, evaluation_version = 2, updated_at = clock_timestamp()
  WHERE id = p_test_id AND user_id = p_user_id AND attempt_phase = 'SUBMITTING';

  RETURN jsonb_build_object(
    'success', true, 'already_completed', false,
    'attempt_phase', 'RESULT_AVAILABLE', 'algorithm_version', p_algorithm_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_and_complete_test(
  uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[],
  jsonb, integer, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_and_complete_test(
  uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[],
  jsonb, integer, jsonb, text
) TO service_role;

COMMIT;
