-- Migration: submit_test_atomic RPC
-- Atomically marks a test as COMPLETED and saves the analysis summary
-- in a single transaction. The heavier per-response scoring still happens
-- in the edge function (Deno), but the critical status-update + analysis
-- write are done here under one transaction to prevent partial failure.
--
-- Usage: called at the END of submit-test after all responses are scored
-- in Deno. If this RPC succeeds, everything is committed together.

CREATE OR REPLACE FUNCTION public.submit_test_atomic(
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
  v_status text;
BEGIN
  -- Verify ownership and status
  SELECT status INTO v_status
  FROM mock_tests
  WHERE id = p_test_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Test not found or access denied');
  END IF;

  IF v_status = 'COMPLETED' THEN
    RETURN jsonb_build_object('already_completed', true);
  END IF;

  -- Upsert analysis row
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

  -- Mark test COMPLETED with submission timestamp
  UPDATE mock_tests
  SET status       = 'COMPLETED',
      submitted_at = now()
  WHERE id = p_test_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to authenticated users (called via service client in edge function)
GRANT EXECUTE ON FUNCTION public.submit_test_atomic(
  uuid, uuid, numeric, numeric, integer, integer,
  jsonb, jsonb, text[], text[], jsonb, integer
) TO authenticated;
