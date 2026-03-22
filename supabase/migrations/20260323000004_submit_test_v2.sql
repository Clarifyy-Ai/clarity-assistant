-- Migration: claim_and_complete_test RPC
-- Atomically claims a test for completion by doing an atomic status transition:
--   UPDATE mock_tests SET status='COMPLETED', submitted_at=now()
--   WHERE id=p_test_id AND user_id=p_user_id AND status!='COMPLETED'
--   RETURNING question_ids, config
--
-- If the UPDATE affects 0 rows, the test is either already completed or not found.
-- Caller checks ownership separately. This approach is truly race-safe because
-- only ONE concurrent call can transition status from non-COMPLETED → COMPLETED.
--
-- Also atomically upserts test_analyses in the same transaction.

CREATE OR REPLACE FUNCTION public.claim_and_complete_test(
  p_test_id              uuid,
  p_user_id              uuid,
  p_total_score          numeric,
  p_max_score            numeric,
  p_accuracy             integer,
  p_attempt_percentage   integer,
  p_subject_breakdown    jsonb,
  p_topic_breakdown      jsonb,
  p_weak_topics          text[],
  p_strong_topics        text[],
  p_time_analysis        jsonb,
  p_predicted_percentile integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_ids text[];
  v_config       jsonb;
  v_status       text;
BEGIN
  -- First check ownership and current status
  SELECT status INTO v_status
  FROM mock_tests
  WHERE id = p_test_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Test not found or access denied');
  END IF;

  IF v_status = 'COMPLETED' THEN
    RETURN jsonb_build_object('already_completed', true);
  END IF;

  -- Atomically claim: transition to COMPLETED only if currently NOT COMPLETED.
  -- This UPDATE is the single serialized gate — at most one concurrent call succeeds.
  UPDATE mock_tests
  SET status       = 'COMPLETED',
      submitted_at = now()
  WHERE id       = p_test_id
    AND user_id  = p_user_id
    AND status  != 'COMPLETED'
  RETURNING question_ids, config
  INTO v_question_ids, v_config;

  IF v_question_ids IS NULL THEN
    -- Another concurrent call already completed this test
    RETURN jsonb_build_object('already_completed', true);
  END IF;

  -- Write analysis in the same transaction (atomically with COMPLETED status)
  INSERT INTO test_analyses (
    test_id, user_id, total_score, max_score, accuracy,
    attempt_percentage, subject_breakdown, topic_breakdown,
    weak_topics, strong_topics, time_analysis, predicted_percentile
  ) VALUES (
    p_test_id, p_user_id, p_total_score, p_max_score, p_accuracy,
    p_attempt_percentage, p_subject_breakdown, p_topic_breakdown,
    p_weak_topics, p_strong_topics, p_time_analysis, p_predicted_percentile
  )
  ON CONFLICT (test_id) DO UPDATE SET
    total_score          = EXCLUDED.total_score,
    max_score            = EXCLUDED.max_score,
    accuracy             = EXCLUDED.accuracy,
    attempt_percentage   = EXCLUDED.attempt_percentage,
    subject_breakdown    = EXCLUDED.subject_breakdown,
    topic_breakdown      = EXCLUDED.topic_breakdown,
    weak_topics          = EXCLUDED.weak_topics,
    strong_topics        = EXCLUDED.strong_topics,
    time_analysis        = EXCLUDED.time_analysis,
    predicted_percentile = EXCLUDED.predicted_percentile;

  -- Return claimed: caller proceeds with once-only side effects
  RETURN jsonb_build_object(
    'claimed',        true,
    'question_ids',   to_jsonb(v_question_ids),
    'config',         v_config
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_and_complete_test(
  uuid, uuid, numeric, numeric, integer, integer,
  jsonb, jsonb, text[], text[], jsonb, integer
) TO authenticated;
