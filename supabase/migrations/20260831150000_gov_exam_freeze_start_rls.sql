-- Government mock exam: freeze snapshots, job stage, answer versions, RLS lockdown.

-- 1. Job FSM: checking_availability
ALTER TABLE public.gov_paper_generation_jobs
  DROP CONSTRAINT IF EXISTS gov_paper_generation_jobs_status_check;

ALTER TABLE public.gov_paper_generation_jobs
  ADD CONSTRAINT gov_paper_generation_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text,
    'leased'::text,
    'checking_availability'::text,
    'selecting'::text,
    'generating'::text,
    'validating'::text,
    'retrieving_sources'::text,
    'analyzing_pattern'::text,
    'planning_blueprint'::text,
    'building_blueprint'::text,
    'selecting_questions'::text,
    'generating_questions'::text,
    'generating_missing_slots'::text,
    'validating_questions'::text,
    'checking_similarity'::text,
    'validating_paper'::text,
    'assembling'::text,
    'completed'::text,
    'failed'::text,
    'failed_retryable'::text,
    'failed_permanent'::text,
    'cancelled'::text,
    'expired'::text
  ]));

-- 2. Frozen question snapshots on generated papers
ALTER TABLE public.gov_generated_paper_questions
  ADD COLUMN IF NOT EXISTS snapshot_json jsonb;

COMMENT ON COLUMN public.gov_generated_paper_questions.snapshot_json IS
  'Frozen stem/options/key/marks/section at paper persist time. Scoring and history must read this, not live bank rows.';

-- 3. Versioned autosave
ALTER TABLE public.test_responses
  ADD COLUMN IF NOT EXISTS client_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS answer_version integer NOT NULL DEFAULT 0;

-- 4. Jobs: owner SELECT only (cancel / create via Edge + service role)
DROP POLICY IF EXISTS gov_jobs_own ON public.gov_paper_generation_jobs;
CREATE POLICY gov_jobs_own_select ON public.gov_paper_generation_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 5. mock_tests: owner SELECT only — start/submit/expire via Edge service role
DROP POLICY IF EXISTS mock_tests_all ON public.mock_tests;
DROP POLICY IF EXISTS "mock_tests_all" ON public.mock_tests;
CREATE POLICY mock_tests_own_select ON public.mock_tests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 6. test_responses: owner SELECT only — writes via save-test-answer / submit-test
DROP POLICY IF EXISTS test_responses_all ON public.test_responses;
DROP POLICY IF EXISTS "test_responses_all" ON public.test_responses;
CREATE POLICY test_responses_own_select ON public.test_responses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service-role start: set started_at / expires_at from server clock
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
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_test
    FROM public.mock_tests
   WHERE id = p_test_id
     AND user_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_test.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUBMISSION_CONFLICT', 'status', v_test.status);
  END IF;

  IF v_test.status = 'IN_PROGRESS' AND v_test.started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_started', true,
      'started_at', v_test.started_at,
      'expires_at', v_test.expires_at,
      'status', v_test.status,
      'attempt_phase', v_test.attempt_phase
    );
  END IF;

  v_limit := COALESCE(v_test.time_limit_minutes, 0);
  IF v_limit > 0 THEN
    v_expires := v_now + make_interval(mins => v_limit);
  ELSE
    v_expires := NULL;
  END IF;

  UPDATE public.mock_tests
     SET status = 'IN_PROGRESS',
         started_at = v_now,
         expires_at = v_expires,
         attempt_phase = 'ACTIVE',
         updated_at = v_now
   WHERE id = p_test_id
     AND user_id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'already_started', false,
    'started_at', v_now,
    'expires_at', v_expires,
    'status', 'IN_PROGRESS',
    'attempt_phase', 'ACTIVE'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_owned_mock_test(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_owned_mock_test(uuid) TO authenticated, service_role;

-- Stale-safe answer upsert
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

  IF v_test.status = 'DRAFT' OR v_test.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_STARTED');
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

-- Playable freeze: stem/options/marks without answer keys
CREATE OR REPLACE VIEW public.gov_paper_questions_playable
WITH (security_invoker = true) AS
SELECT
  gpq.id,
  gpq.paper_id,
  gpq.question_id,
  gpq.section_code,
  gpq.sort_order,
  gpq.source_class,
  gpq.question_source_type,
  CASE
    WHEN gpq.snapshot_json IS NULL THEN NULL
    ELSE (gpq.snapshot_json - 'correct_answer' - 'explanation')
  END AS snapshot_json
FROM public.gov_generated_paper_questions gpq;

GRANT SELECT ON public.gov_paper_questions_playable TO authenticated, service_role;
