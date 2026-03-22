-- Migration: create_test_atomic RPC
-- Atomically: checks free-plan monthly quota + deducts 2 credits + inserts mock_test row
-- All three operations run in a single transaction so partial failure is impossible.

CREATE OR REPLACE FUNCTION public.create_test_atomic(
  p_user_id         uuid,
  p_test_name       text,
  p_config          jsonb,
  p_question_ids    text[],
  p_time_limit      integer,
  p_credit_cost     integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id       text;
  v_credits       integer;
  v_monthly_count integer;
  v_month_start   timestamptz;
  v_test_id       uuid;
BEGIN
  -- Lock the profile row for this user to prevent concurrent race conditions
  SELECT plan_id, credits
  INTO v_plan_id, v_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found', 'code', 'PROFILE_NOT_FOUND');
  END IF;

  -- Check free-plan monthly test quota (2 tests per calendar month)
  IF v_plan_id = 'free' THEN
    v_month_start := date_trunc('month', now());
    SELECT COUNT(*)
    INTO v_monthly_count
    FROM mock_tests
    WHERE user_id = p_user_id
      AND created_at >= v_month_start;

    IF v_monthly_count >= 2 THEN
      RETURN jsonb_build_object(
        'error', 'Free plan limit reached. You can take 2 tests per month. Upgrade for unlimited access.',
        'code', 'FREE_PLAN_LIMIT'
      );
    END IF;
  END IF;

  -- Check sufficient credit balance
  IF v_credits < p_credit_cost THEN
    RETURN jsonb_build_object(
      'error', 'Insufficient credits. Mock tests cost 2 credits.',
      'code', 'INSUFFICIENT_CREDITS'
    );
  END IF;

  -- Deduct credits atomically (profile row is still locked)
  UPDATE profiles
  SET credits = credits - p_credit_cost
  WHERE id = p_user_id;

  -- Log credit transaction
  INSERT INTO credit_transactions (user_id, amount, reason, created_at)
  VALUES (p_user_id, -p_credit_cost, 'Mock test creation', now());

  -- Insert the test row
  INSERT INTO mock_tests (user_id, test_name, config, question_ids, status, time_limit_minutes)
  VALUES (p_user_id, p_test_name, p_config, p_question_ids, 'DRAFT', p_time_limit)
  RETURNING id INTO v_test_id;

  RETURN jsonb_build_object('test_id', v_test_id);
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.create_test_atomic(uuid, text, jsonb, text[], integer, integer)
  TO authenticated;
