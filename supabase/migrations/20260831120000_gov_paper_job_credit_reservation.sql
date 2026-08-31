-- Two-phase credits + canonical job statuses for gov paper generation.
-- Reserve on accept, finalize after a stored paper, release on terminal failure.

ALTER TABLE public.gov_paper_generation_jobs
  ADD COLUMN IF NOT EXISTS credits_reserved integer NOT NULL DEFAULT 0
    CHECK (credits_reserved >= 0),
  ADD COLUMN IF NOT EXISTS credits_finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS credits_released_at timestamptz;

UPDATE public.gov_paper_generation_jobs
   SET credits_reserved = credits_charged
 WHERE credits_reserved = 0
   AND credits_charged > 0
   AND credits_finalized_at IS NULL
   AND credits_released_at IS NULL
   AND status NOT IN ('completed', 'cancelled', 'failed_permanent', 'expired');

ALTER TABLE public.gov_paper_generation_jobs
  DROP CONSTRAINT IF EXISTS gov_paper_generation_jobs_status_check;

ALTER TABLE public.gov_paper_generation_jobs
  ADD CONSTRAINT gov_paper_generation_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text,
    'leased'::text,
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

COMMENT ON COLUMN public.gov_paper_generation_jobs.credits_reserved IS
  'Held credits after accept; zero after finalize or release.';
COMMENT ON COLUMN public.gov_paper_generation_jobs.credits_finalized_at IS
  'Set once when a valid paper + mock_test are stored.';
COMMENT ON COLUMN public.gov_paper_generation_jobs.credits_released_at IS
  'Set once when reserved credits are returned on eligible failure.';

CREATE OR REPLACE FUNCTION public.reserve_gov_paper_credits(
  p_job_id uuid,
  p_user_id uuid,
  p_cost integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.gov_paper_generation_jobs;
  v_deduct jsonb;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_COST');
  END IF;

  SELECT * INTO v_job
    FROM public.gov_paper_generation_jobs
   WHERE id = p_job_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_FOUND');
  END IF;

  IF v_job.credits_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_finalized', true, 'reserved', v_job.credits_reserved);
  END IF;
  IF v_job.credits_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_RELEASED');
  END IF;
  IF v_job.credits_reserved > 0 OR v_job.credits_charged > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_reserved', true,
      'reserved', GREATEST(v_job.credits_reserved, v_job.credits_charged)
    );
  END IF;

  v_deduct := public.deduct_credits_service(
    p_user_id,
    'create_mock_test',
    p_cost,
    NULL,
    COALESCE(NULLIF(trim(p_idempotency_key), ''), 'gov_paper:' || p_job_id::text),
    NULL
  );

  IF COALESCE((v_deduct->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_deduct;
  END IF;

  UPDATE public.gov_paper_generation_jobs
     SET credits_reserved = p_cost,
         credits_charged = p_cost,
         credit_reservation = COALESCE(credit_reservation, 'gov_paper:' || p_idempotency_key),
         updated_at = NOW()
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'reserved', p_cost,
    'balance_after', (v_deduct->>'new_balance')::integer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_gov_paper_credits(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.gov_paper_generation_jobs;
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

  UPDATE public.gov_paper_generation_jobs
     SET credits_finalized_at = NOW(),
         updated_at = NOW()
   WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'finalized', true, 'amount', v_job.credits_reserved);
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
  IF v_job.credits_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_FINALIZED');
  END IF;
  IF v_job.credits_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_released', true);
  END IF;

  v_amount := GREATEST(COALESCE(v_job.credits_reserved, 0), COALESCE(v_job.credits_charged, 0));
  IF v_amount <= 0 THEN
    UPDATE public.gov_paper_generation_jobs
       SET credits_released_at = NOW(),
           credits_reserved = 0,
           credits_charged = 0,
           updated_at = NOW()
     WHERE id = p_job_id;
    RETURN jsonb_build_object('success', true, 'released', 0);
  END IF;

  v_refund := public.refund_credits(
    v_job.user_id,
    v_amount,
    COALESCE(NULLIF(trim(p_reason), ''), 'refund_paper_job:' || p_job_id::text),
    NULL
  );

  UPDATE public.gov_paper_generation_jobs
     SET credits_released_at = NOW(),
         credits_reserved = 0,
         credits_charged = 0,
         updated_at = NOW()
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', COALESCE((v_refund->>'success')::boolean, true),
    'released', v_amount,
    'refund', v_refund
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_gov_paper_credits(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_gov_paper_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_gov_paper_credits(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_gov_paper_credits(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_gov_paper_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_gov_paper_credits(uuid, text) TO service_role;
