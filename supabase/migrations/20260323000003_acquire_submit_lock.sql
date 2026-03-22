-- Migration: acquire_submit_lock RPC
-- Used by submit-test edge function to serialize concurrent submissions.
-- Acquires a SELECT ... FOR UPDATE lock on the mock_tests row, then:
--   - Returns error if test not found or ownership mismatch
--   - Returns already_completed=true if test is already COMPLETED
--   - Returns question_ids + config for active tests
--
-- Because this uses FOR UPDATE, a second concurrent call for the same
-- test_id + user_id will block until the first transaction completes,
-- then see the COMPLETED status and return early.

CREATE OR REPLACE FUNCTION public.acquire_submit_lock(
  p_test_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status       text;
  v_question_ids text[];
  v_config       jsonb;
BEGIN
  -- Lock the row for this test atomically
  SELECT status, question_ids, config
  INTO v_status, v_question_ids, v_config
  FROM mock_tests
  WHERE id = p_test_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Test not found or access denied');
  END IF;

  IF v_status = 'COMPLETED' THEN
    RETURN jsonb_build_object('already_completed', true);
  END IF;

  -- Lock acquired; test is IN_PROGRESS or DRAFT — return what the caller needs
  RETURN jsonb_build_object(
    'question_ids', to_jsonb(v_question_ids),
    'config',       v_config
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_submit_lock(uuid, uuid) TO authenticated;
