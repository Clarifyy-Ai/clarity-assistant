-- Atomic paper-job acceptance, durable recovery, and terminal credit settlement.

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
    'assembling'::text,
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
    'completed'::text,
    'failed'::text,
    'failed_retryable'::text,
    'failed_permanent'::text,
    'cancelled'::text,
    'expired'::text
  ]));

DROP INDEX IF EXISTS public.idx_gov_paper_jobs_claimable;
CREATE INDEX idx_gov_paper_jobs_claimable
  ON public.gov_paper_generation_jobs (status, lease_expires_at, created_at)
  WHERE retryable = true
    AND status IN (
      'queued', 'leased', 'checking_availability', 'selecting', 'generating',
      'validating', 'assembling', 'retrieving_sources', 'analyzing_pattern',
      'planning_blueprint', 'building_blueprint', 'selecting_questions',
      'generating_questions', 'generating_missing_slots', 'validating_questions',
      'checking_similarity', 'validating_paper', 'failed_retryable'
    );

CREATE OR REPLACE FUNCTION public.enqueue_gov_paper_job(
  p_user_id uuid,
  p_exam_id uuid,
  p_stage_id uuid,
  p_pattern_version_id uuid,
  p_syllabus_version_id uuid,
  p_mode text,
  p_language text,
  p_request_json jsonb,
  p_source_mix jsonb,
  p_missing_count integer,
  p_idempotency_key text,
  p_cost integer,
  p_random_seed text,
  p_inventory_snapshot jsonb,
  p_inventory_version text,
  p_status text DEFAULT 'queued',
  p_progress_stage text DEFAULT 'queued'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.gov_paper_generation_jobs;
  v_job public.gov_paper_generation_jobs;
  v_balance integer;
  v_deduct jsonb;
  v_credit_key text;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF p_user_id IS NULL OR p_exam_id IS NULL OR p_cost IS NULL OR p_cost <= 0
     OR NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_OPERATION');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || btrim(p_idempotency_key), 0)
  );

  SELECT * INTO v_existing
    FROM public.gov_paper_generation_jobs
   WHERE user_id = p_user_id
     AND idempotency_key = btrim(p_idempotency_key)
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'job_id', v_existing.id,
      'status', v_existing.status,
      'progress_stage', COALESCE(v_existing.progress_stage, v_existing.status),
      'mock_test_id', v_existing.mock_test_id,
      'paper_id', v_existing.generated_paper_id,
      'balance_after', NULL,
      'idempotent_replay', true
    );
  END IF;

  -- This row lock is the authoritative exact-cost preflight. No job or credit
  -- reservation exists yet, and a concurrent spender cannot pass this point.
  SELECT credits INTO v_balance
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'ACCOUNT_RESTRICTED', 'error', 'Profile not found'
    );
  END IF;
  v_balance := COALESCE(v_balance, 0);
  IF v_balance < p_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_CREDITS',
      'error', 'Insufficient credits',
      'balance', v_balance,
      'cost', p_cost,
      'required', p_cost,
      'shortfall', p_cost - v_balance
    );
  END IF;

  v_credit_key :=
    'gov_paper_job:' || p_user_id::text || ':' || btrim(p_idempotency_key);
  v_deduct := public.deduct_credits_service(
    p_user_id,
    'create_mock_test',
    p_cost,
    NULL,
    v_credit_key,
    NULL
  );
  IF COALESCE((v_deduct->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_deduct;
  END IF;

  INSERT INTO public.gov_paper_generation_jobs (
    user_id, exam_id, stage_id, pattern_version_id, syllabus_version_id,
    mode, language, request_json, source_mix, missing_count, status,
    progress_stage, idempotency_key, credit_reservation, credits_charged,
    credits_reserved, random_seed, inventory_snapshot, inventory_version,
    attempt_count, retryable, worker_id, lease_expires_at, started_at
  ) VALUES (
    p_user_id, p_exam_id, p_stage_id, p_pattern_version_id, p_syllabus_version_id,
    p_mode, COALESCE(NULLIF(btrim(p_language), ''), 'en'),
    COALESCE(p_request_json, '{}'::jsonb), COALESCE(p_source_mix, '{}'::jsonb),
    p_missing_count, p_status, COALESCE(NULLIF(p_progress_stage, ''), p_status),
    btrim(p_idempotency_key), v_credit_key, p_cost, p_cost, p_random_seed,
    p_inventory_snapshot, p_inventory_version, 0, true, NULL, NULL, NOW()
  )
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job.id,
    'status', v_job.status,
    'progress_stage', v_job.progress_stage,
    'balance_after', (v_deduct->>'new_balance')::integer,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_gov_paper_job(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, integer, text,
  integer, text, jsonb, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_gov_paper_job(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, integer, text,
  integer, text, jsonb, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_gov_paper_credits(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.gov_paper_generation_jobs;
  v_amount integer;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  SELECT * INTO v_job
    FROM public.gov_paper_generation_jobs
   WHERE id = p_job_id
   FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_FOUND');
  END IF;
  IF v_job.credits_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_RELEASED');
  END IF;
  IF v_job.status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_COMPLETED');
  END IF;
  IF v_job.credits_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_finalized', true);
  END IF;
  v_amount := GREATEST(v_job.credits_reserved, v_job.credits_charged);
  UPDATE public.gov_paper_generation_jobs
     SET credits_finalized_at = NOW(), credits_reserved = 0, updated_at = NOW()
   WHERE id = p_job_id;
  RETURN jsonb_build_object('success', true, 'finalized', true, 'amount', v_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_gov_paper_credits(
  p_job_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.gov_paper_generation_jobs;
  v_amount integer;
  v_refund jsonb;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  SELECT * INTO v_job
    FROM public.gov_paper_generation_jobs
   WHERE id = p_job_id
   FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_FOUND');
  END IF;
  IF v_job.status NOT IN ('failed_permanent', 'cancelled', 'expired') THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'JOB_NOT_RELEASABLE', 'status', v_job.status
    );
  END IF;
  IF v_job.credits_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_FINALIZED');
  END IF;
  IF v_job.credits_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_released', true, 'released', 0);
  END IF;

  v_amount := GREATEST(v_job.credits_reserved, v_job.credits_charged);
  IF v_amount > 0 THEN
    v_refund := public.refund_credits(
      v_job.user_id,
      v_amount,
      COALESCE(NULLIF(btrim(p_reason), ''), 'refund_paper_job:' || p_job_id::text),
      NULL
    );
    IF COALESCE((v_refund->>'success')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'success', false, 'code', 'REFUND_FAILED', 'released', 0, 'refund', v_refund
      );
    END IF;
  END IF;

  UPDATE public.gov_paper_generation_jobs
     SET credits_released_at = NOW(),
         credits_reserved = 0,
         credits_charged = 0,
         updated_at = NOW()
   WHERE id = p_job_id;
  RETURN jsonb_build_object('success', true, 'released', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_gov_paper_credits(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_gov_paper_credits(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_gov_paper_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_gov_paper_credits(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sweep_gov_paper_jobs(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := NOW();
  v_retryable integer := 0;
  v_terminal integer := 0;
  v_new_terminal integer := 0;
  v_released integer := 0;
  v_job record;
  v_release jsonb;
BEGIN
  IF current_user <> 'postgres' AND NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  -- Hard wall clock bounds every retry chain.
  WITH expired AS (
    UPDATE public.gov_paper_generation_jobs
       SET status = 'expired',
           progress_stage = 'expired',
           retryable = false,
           error_code = 'JOB_EXPIRED',
           error_message = 'Paper generation exceeded the maximum recovery window.',
           worker_id = NULL,
           lease_expires_at = NULL,
           completed_at = v_now,
           updated_at = v_now
     WHERE id IN (
       SELECT id FROM public.gov_paper_generation_jobs
        WHERE status NOT IN ('completed', 'failed_permanent', 'cancelled', 'expired')
          AND created_at < v_now - interval '30 minutes'
        ORDER BY created_at
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id
  )
  SELECT count(*)::integer INTO v_terminal FROM expired;

  -- Lost leases are restartable until the bounded attempt budget is exhausted.
  WITH recovered AS (
    UPDATE public.gov_paper_generation_jobs
       SET status = CASE WHEN attempt_count >= 3
                         THEN 'failed_permanent' ELSE 'failed_retryable' END,
           progress_stage = CASE WHEN attempt_count >= 3
                                 THEN 'failed_permanent' ELSE 'failed_retryable' END,
           retryable = attempt_count < 3,
           error_code = CASE WHEN attempt_count >= 3
                             THEN 'MAX_ATTEMPTS' ELSE 'WORKER_LEASE_EXPIRED' END,
           error_message = CASE WHEN attempt_count >= 3
             THEN 'Generation worker lease expired too many times.'
             ELSE 'Generation worker lost its lease. Retry is safe.' END,
           worker_id = NULL,
           lease_expires_at = NULL,
           completed_at = CASE WHEN attempt_count >= 3 THEN v_now ELSE NULL END,
           updated_at = v_now
     WHERE id IN (
       SELECT id FROM public.gov_paper_generation_jobs
        WHERE status IN (
          'leased', 'checking_availability', 'selecting', 'generating',
          'validating', 'assembling', 'retrieving_sources', 'analyzing_pattern',
          'planning_blueprint', 'building_blueprint', 'selecting_questions',
          'generating_questions', 'generating_missing_slots',
          'validating_questions', 'checking_similarity', 'validating_paper'
        )
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < v_now
        ORDER BY lease_expires_at
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
        FOR UPDATE SKIP LOCKED
     )
     RETURNING status
  )
  SELECT
    count(*) FILTER (WHERE status = 'failed_retryable')::integer,
    count(*) FILTER (WHERE status = 'failed_permanent')::integer
    INTO v_retryable, v_new_terminal
  FROM recovered;
  v_terminal := v_terminal + COALESCE(v_new_terminal, 0);

  -- Queued/checking jobs that never obtained a lease become retryable first.
  WITH orphaned AS (
    UPDATE public.gov_paper_generation_jobs
       SET status = 'failed_retryable',
           progress_stage = 'failed_retryable',
           retryable = true,
           error_code = 'WORKER_UNAVAILABLE',
           error_message = 'No worker claimed the job. Retry is safe.',
           worker_id = NULL,
           lease_expires_at = NULL,
           updated_at = v_now
     WHERE id IN (
       SELECT id FROM public.gov_paper_generation_jobs
        WHERE status IN ('queued', 'checking_availability')
          AND lease_expires_at IS NULL
          AND created_at < v_now - interval '10 minutes'
          AND created_at >= v_now - interval '30 minutes'
        ORDER BY created_at
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id
  )
  SELECT v_retryable + count(*)::integer INTO v_retryable FROM orphaned;

  -- Cron runs as postgres; make the tightly scoped release RPC see service role.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  FOR v_job IN
    SELECT id
      FROM public.gov_paper_generation_jobs
     WHERE status IN ('failed_permanent', 'cancelled', 'expired')
       AND credits_finalized_at IS NULL
       AND credits_released_at IS NULL
     ORDER BY updated_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  LOOP
    v_release := public.release_gov_paper_credits(
      v_job.id, 'refund_gov_paper_sweeper'
    );
    IF COALESCE((v_release->>'success')::boolean, false) THEN
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'retryable', v_retryable,
    'terminal', v_terminal,
    'credits_released', v_released
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_gov_paper_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_gov_paper_jobs(integer)
  TO service_role;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('sweep-gov-paper-jobs-every-minute');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(
  'sweep-gov-paper-jobs-every-minute',
  '* * * * *',
  $$ SELECT public.sweep_gov_paper_jobs(100); $$
);
