-- Cross-cutting consistency: admin role listing, has_role lockdown,
-- refunds tied to operation cost, atomic test finalization.

-- 1) Admins can SELECT other users' roles; users still see only their own.
DROP POLICY IF EXISTS user_roles_admin_select ON public.user_roles;
CREATE POLICY user_roles_admin_select
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_admin()
  );

-- 2) Keep has_role executable for RLS (policies call has_role(auth.uid(), …)),
-- but clamp the target UUID so authenticated callers cannot enumerate others.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = CASE
      WHEN COALESCE(auth.role(), current_setting('role', true))
        IN ('service_role', 'postgres', 'supabase_admin')
        THEN _user_id
      ELSE auth.uid()
    END
    AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_own_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), _role);
$$;

REVOKE ALL ON FUNCTION public.has_own_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_own_role(public.app_role) TO authenticated, service_role;

-- 3) Refunds: optional source transaction; safety cap above max action cost (20).
DROP FUNCTION IF EXISTS public.refund_credits(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_cost INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_source_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
  v_amount INTEGER;
  v_txn_amount INTEGER;
  MAX_REFUND_SAFETY CONSTANT INTEGER := 100;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_RESTRICTED',
      'error', 'Forbidden'
    );
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OPERATION',
      'error', 'Missing user id'
    );
  END IF;

  IF p_source_transaction_id IS NOT NULL THEN
    SELECT ABS(amount) INTO v_txn_amount
      FROM public.credit_transactions
     WHERE id = p_source_transaction_id
       AND user_id = p_user_id
       AND action = 'usage';

    IF v_txn_amount IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'INVALID_OPERATION',
        'error', 'Source usage transaction not found',
        'safety_cap', MAX_REFUND_SAFETY
      );
    END IF;
    v_amount := v_txn_amount;
  ELSE
    v_amount := p_cost;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > MAX_REFUND_SAFETY THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OPERATION',
      'error', 'Invalid refund amount',
      'safety_cap', MAX_REFUND_SAFETY,
      'requested', v_amount
    );
  END IF;

  UPDATE public.profiles
     SET credits = credits + v_amount,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING credits INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_RESTRICTED',
      'error', 'Profile not found'
    );
  END IF;

  INSERT INTO public.credit_transactions (
    user_id,
    action,
    amount,
    balance_after,
    description,
    created_at
  ) VALUES (
    p_user_id,
    'refund'::public.credit_action,
    v_amount,
    v_new_balance,
    COALESCE(NULLIF(trim(p_reason), ''), 'Credit refund'),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', 'OK',
    'new_balance', v_new_balance,
    'balance', v_new_balance,
    'refunded', v_amount,
    'safety_cap', MAX_REFUND_SAFETY
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT, UUID) TO service_role;

-- 4) Atomic test completion including response rows.
ALTER TABLE public.test_analyses
  ADD COLUMN IF NOT EXISTS algorithm_version text;

DROP FUNCTION IF EXISTS public.claim_and_complete_test(
  uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[], jsonb, integer
);

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
  p_predicted_percentile integer,
  p_responses            jsonb DEFAULT '[]'::jsonb,
  p_algorithm_version    text DEFAULT 'mock_test_score_v1'
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
  v_row          jsonb;
BEGIN
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

  UPDATE mock_tests
  SET status       = 'COMPLETED',
      submitted_at = now()
  WHERE id       = p_test_id
    AND user_id  = p_user_id
    AND status  != 'COMPLETED'
  RETURNING question_ids, config
  INTO v_question_ids, v_config;

  IF v_question_ids IS NULL THEN
    RETURN jsonb_build_object('already_completed', true);
  END IF;

  IF jsonb_typeof(p_responses) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_responses)
    LOOP
      INSERT INTO test_responses (
        test_id, user_id, question_id, user_answer, is_attempted,
        is_correct, is_marked_review, time_spent_seconds, answered_at, updated_at
      ) VALUES (
        p_test_id,
        p_user_id,
        (v_row->>'question_id')::uuid,
        v_row->>'user_answer',
        COALESCE((v_row->>'is_attempted')::boolean, false),
        COALESCE((v_row->>'is_correct')::boolean, false),
        COALESCE((v_row->>'is_marked_review')::boolean, false),
        NULLIF(v_row->>'time_spent_seconds', '')::integer,
        now(),
        now()
      )
      ON CONFLICT (test_id, question_id) DO UPDATE SET
        user_answer = EXCLUDED.user_answer,
        is_attempted = EXCLUDED.is_attempted,
        is_correct = EXCLUDED.is_correct,
        is_marked_review = EXCLUDED.is_marked_review,
        time_spent_seconds = EXCLUDED.time_spent_seconds,
        updated_at = now();
    END LOOP;
  END IF;

  INSERT INTO test_analyses (
    test_id, user_id, total_score, max_score, accuracy,
    attempt_percentage, subject_breakdown, topic_breakdown,
    weak_topics, strong_topics, time_analysis, predicted_percentile,
    algorithm_version
  ) VALUES (
    p_test_id, p_user_id, p_total_score, p_max_score, p_accuracy,
    p_attempt_percentage, p_subject_breakdown, p_topic_breakdown,
    p_weak_topics, p_strong_topics, p_time_analysis, p_predicted_percentile,
    p_algorithm_version
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
    predicted_percentile = EXCLUDED.predicted_percentile,
    algorithm_version    = EXCLUDED.algorithm_version;

  RETURN jsonb_build_object(
    'success', true,
    'already_completed', false,
    'algorithm_version', p_algorithm_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_and_complete_test(
  uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[], jsonb, integer, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_and_complete_test(
  uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[], jsonb, integer, jsonb, text
) TO authenticated, service_role;
