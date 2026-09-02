-- Durable company-brief generation jobs.
-- Enqueue + reserve credits on accept; generate in the background; finalize
-- once the brief is saved; release exactly once on failure/cancel.

CREATE TABLE IF NOT EXISTS public.company_research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  company_name_normalized text NOT NULL,
  role_title text,
  force boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status = ANY (ARRAY[
      'queued'::text,
      'processing'::text,
      'completed'::text,
      'failed'::text,
      'cancelled'::text
    ])),
  progress_stage text,
  error_code text,
  error_message text,
  retryable boolean NOT NULL DEFAULT true,
  idempotency_key text NOT NULL,
  credit_reservation text,
  credits_reserved integer NOT NULL DEFAULT 0
    CHECK (credits_reserved >= 0),
  credits_finalized_at timestamptz,
  credits_released_at timestamptz,
  research_id uuid REFERENCES public.company_research(id) ON DELETE SET NULL,
  brief jsonb,
  source text,
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  cancel_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT company_research_jobs_user_idempotency_key
    UNIQUE (user_id, idempotency_key)
);

COMMENT ON TABLE public.company_research_jobs IS
  'Async company brief generation. Edge Function is the only writer; clients SELECT own rows.';

CREATE UNIQUE INDEX IF NOT EXISTS company_research_jobs_inflight_uidx
  ON public.company_research_jobs (user_id, company_name_normalized)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS company_research_jobs_user_created_idx
  ON public.company_research_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS company_research_jobs_status_updated_idx
  ON public.company_research_jobs (status, updated_at);

ALTER TABLE public.company_research_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_research_jobs_owner_read ON public.company_research_jobs;
CREATE POLICY company_research_jobs_owner_read
  ON public.company_research_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.company_research_jobs FROM anon, authenticated;
GRANT SELECT ON public.company_research_jobs TO authenticated;
GRANT ALL ON public.company_research_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_company_research_credits(
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
  v_job public.company_research_jobs;
  v_deduct jsonb;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_COST');
  END IF;

  SELECT * INTO v_job
    FROM public.company_research_jobs
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
  IF v_job.credits_reserved > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_reserved', true,
      'reserved', v_job.credits_reserved
    );
  END IF;

  v_deduct := public.deduct_credits_service(
    p_user_id,
    'company_research',
    p_cost,
    NULL,
    COALESCE(NULLIF(trim(p_idempotency_key), ''), 'company_research:' || p_job_id::text),
    NULL
  );

  IF COALESCE((v_deduct->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_deduct;
  END IF;

  UPDATE public.company_research_jobs
     SET credits_reserved = p_cost,
         credit_reservation = COALESCE(
           NULLIF(trim(p_idempotency_key), ''),
           'company_research:' || p_job_id::text
         ),
         updated_at = NOW()
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'reserved', p_cost,
    'balance_after', (v_deduct->>'new_balance')::integer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_company_research_credits(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.company_research_jobs;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_job
    FROM public.company_research_jobs
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

  UPDATE public.company_research_jobs
     SET credits_finalized_at = NOW(),
         updated_at = NOW()
   WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'finalized', true, 'amount', v_job.credits_reserved);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_company_research_credits(
  p_job_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.company_research_jobs;
  v_amount integer;
  v_refund jsonb;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_job
    FROM public.company_research_jobs
   WHERE id = p_job_id
   FOR UPDATE;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_FOUND');
  END IF;
  IF v_job.credits_finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_FINALIZED');
  END IF;
  IF v_job.credits_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_released', true, 'released', 0);
  END IF;

  v_amount := GREATEST(COALESCE(v_job.credits_reserved, 0), 0);
  IF v_amount <= 0 THEN
    UPDATE public.company_research_jobs
       SET credits_released_at = NOW(),
           credits_reserved = 0,
           updated_at = NOW()
     WHERE id = p_job_id;
    RETURN jsonb_build_object('success', true, 'released', 0);
  END IF;

  v_refund := public.refund_credits(
    v_job.user_id,
    v_amount,
    COALESCE(NULLIF(trim(p_reason), ''), 'refund_company_research:' || p_job_id::text),
    NULL
  );

  UPDATE public.company_research_jobs
     SET credits_released_at = NOW(),
         credits_reserved = 0,
         updated_at = NOW()
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', COALESCE((v_refund->>'success')::boolean, true),
    'released', v_amount,
    'refund', v_refund
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_company_research_credits(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_company_research_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_company_research_credits(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_company_research_credits(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_company_research_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_company_research_credits(uuid, text) TO service_role;
