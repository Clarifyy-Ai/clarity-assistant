-- Durable document-processing jobs with PostgreSQL leasing and credit settlement.
-- Additive migration; existing document records and parser contracts remain intact.

BEGIN;

CREATE TABLE IF NOT EXISTS public.document_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.personal_library_documents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL DEFAULT 'parse'
    CHECK (operation IN ('parse', 'exam_source', 'validate_paper')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'leased', 'downloading', 'extracting', 'OCR', 'segmenting',
      'validating', 'awaiting_review', 'completed', 'failed_retryable',
      'failed_permanent', 'cancelled'
    )),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT,
  storage_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
  parser_version TEXT,
  result_reference TEXT,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code TEXT,
  error_message TEXT,
  error_stage TEXT,
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  worker_id TEXT,
  cancel_requested_at TIMESTAMPTZ,
  credits_reserved INTEGER NOT NULL DEFAULT 0 CHECK (credits_reserved >= 0),
  credit_transaction_id UUID,
  credits_settled_at TIMESTAMPTZ,
  credits_refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS document_processing_jobs_idempotency_uidx
  ON public.document_processing_jobs(owner_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS document_processing_jobs_active_document_uidx
  ON public.document_processing_jobs(document_id)
  WHERE status IN (
    'queued', 'leased', 'downloading', 'extracting', 'OCR', 'segmenting',
    'validating', 'awaiting_review', 'failed_retryable'
  );

CREATE INDEX IF NOT EXISTS document_processing_jobs_claimable_idx
  ON public.document_processing_jobs(status, available_at, lease_expires_at, created_at)
  WHERE status IN ('queued', 'failed_retryable', 'leased', 'downloading', 'extracting',
                   'OCR', 'segmenting', 'validating', 'awaiting_review');

CREATE TABLE IF NOT EXISTS public.document_processing_job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.document_processing_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  worker_id TEXT,
  status TEXT NOT NULL,
  stage TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_processing_job_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_processing_jobs_owner_read ON public.document_processing_jobs;
CREATE POLICY document_processing_jobs_owner_read
  ON public.document_processing_jobs FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS document_processing_job_attempts_owner_read ON public.document_processing_job_attempts;
CREATE POLICY document_processing_job_attempts_owner_read
  ON public.document_processing_job_attempts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_processing_jobs j
    WHERE j.id = document_processing_job_attempts.job_id
      AND j.owner_id = auth.uid()
  ));

REVOKE ALL ON public.document_processing_jobs FROM anon, authenticated;
GRANT SELECT ON public.document_processing_jobs TO authenticated;
REVOKE ALL ON public.document_processing_job_attempts FROM anon, authenticated;
GRANT SELECT ON public.document_processing_job_attempts TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_document_processing_job(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.document_processing_jobs;
  v_dead_job RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     OR p_worker_id IS NULL OR length(trim(p_worker_id)) < 8
     OR p_lease_seconds NOT BETWEEN 30 AND 3600 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN_OR_INVALID');
  END IF;

  FOR v_dead_job IN
    SELECT id
      FROM public.document_processing_jobs
     WHERE attempt_count >= max_attempts
       AND (
         (status = 'failed_retryable' AND available_at <= v_now)
         OR (status IN ('leased', 'downloading', 'extracting', 'OCR', 'segmenting',
                        'validating', 'awaiting_review')
             AND lease_expires_at < v_now)
       )
       AND cancel_requested_at IS NULL
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.document_processing_jobs
       SET status = 'failed_permanent',
           retryable = FALSE,
           completed_at = v_now,
           lease_expires_at = NULL,
           worker_id = NULL,
           error_code = 'MAX_ATTEMPTS',
           error_message = 'Maximum processing attempts exceeded.',
           error_stage = 'leasing',
           updated_at = v_now
     WHERE id = v_dead_job.id;
    PERFORM public.refund_document_processing_job(
      v_dead_job.id,
      'document_processing_max_attempts'
    );
  END LOOP;

  WITH candidate AS (
    SELECT id
    FROM public.document_processing_jobs
    WHERE (
      (
        status IN ('queued', 'failed_retryable')
        AND available_at <= v_now
      ) OR (
        status IN ('leased', 'downloading', 'extracting', 'OCR', 'segmenting',
                   'validating', 'awaiting_review')
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < v_now
      )
    )
    AND attempt_count < max_attempts
    AND cancel_requested_at IS NULL
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.document_processing_jobs j
     SET status = 'leased',
         worker_id = trim(p_worker_id),
         lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
         heartbeat_at = v_now,
         attempt_count = j.attempt_count + 1,
         error_code = NULL,
         error_message = NULL,
         error_stage = NULL,
         updated_at = v_now
    FROM candidate
   WHERE j.id = candidate.id
  RETURNING j.* INTO v_job;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_CLAIMABLE_JOB');
  END IF;

  INSERT INTO public.document_processing_job_attempts
    (job_id, attempt_number, worker_id, status)
  VALUES (v_job.id, v_job.attempt_count, v_job.worker_id, 'leased');

  RETURN jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_document_processing_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     OR p_lease_seconds NOT BETWEEN 30 AND 3600 THEN
    RETURN FALSE;
  END IF;
  UPDATE public.document_processing_jobs
     SET heartbeat_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
         updated_at = NOW()
   WHERE id = p_job_id
     AND worker_id = p_worker_id
     AND status IN ('leased', 'downloading', 'extracting', 'OCR', 'segmenting', 'validating', 'awaiting_review')
     AND lease_expires_at > NOW();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_document_processing_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_status TEXT,
  p_stage TEXT DEFAULT NULL,
  p_result_reference TEXT DEFAULT NULL,
  p_warnings JSONB DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_retryable BOOLEAN DEFAULT FALSE,
  p_backoff_seconds INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.document_processing_jobs;
  v_effective_status TEXT;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     OR p_status NOT IN (
       'downloading', 'extracting', 'OCR', 'segmenting', 'validating',
       'awaiting_review', 'completed', 'failed_retryable', 'failed_permanent'
     )
     OR p_backoff_seconds NOT BETWEEN 0 AND 86400 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TRANSITION');
  END IF;
  SELECT CASE
    WHEN p_status = 'failed_retryable' AND attempt_count >= max_attempts
      THEN 'failed_permanent'
    ELSE p_status
  END INTO v_effective_status
  FROM public.document_processing_jobs
  WHERE id = p_job_id;
  IF v_effective_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND');
  END IF;

  UPDATE public.document_processing_jobs
     SET status = v_effective_status,
         result_reference = COALESCE(p_result_reference, result_reference),
         warnings = COALESCE(p_warnings, warnings),
         error_code = p_error_code,
         error_message = p_error_message,
         error_stage = p_stage,
         retryable = CASE
           WHEN v_effective_status = 'completed' THEN FALSE
           WHEN v_effective_status IN ('failed_retryable', 'failed_permanent') THEN
             v_effective_status = 'failed_retryable' AND attempt_count < max_attempts
           ELSE retryable
         END,
         available_at = CASE
           WHEN v_effective_status = 'failed_retryable' AND attempt_count < max_attempts
             THEN NOW() + make_interval(secs => p_backoff_seconds)
           ELSE available_at
         END,
         completed_at = CASE
           WHEN v_effective_status IN ('completed', 'failed_permanent') THEN NOW()
           ELSE completed_at
         END,
         lease_expires_at = CASE
           WHEN v_effective_status IN ('completed', 'failed_permanent', 'failed_retryable') THEN NULL
           ELSE lease_expires_at
         END,
         worker_id = CASE
           WHEN v_effective_status IN ('completed', 'failed_permanent', 'failed_retryable') THEN NULL
           ELSE worker_id
         END,
         updated_at = NOW()
   WHERE id = p_job_id
     AND worker_id = p_worker_id
     AND lease_expires_at > NOW()
     AND status NOT IN ('completed', 'failed_permanent', 'cancelled')
  RETURNING * INTO v_job;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LEASE_LOST_OR_TERMINAL');
  END IF;

  UPDATE public.document_processing_job_attempts
     SET status = v_effective_status,
         stage = COALESCE(p_stage, stage),
         error_code = p_error_code,
         error_message = p_error_message,
         finished_at = CASE
           WHEN v_effective_status IN ('completed', 'failed_retryable', 'failed_permanent') THEN NOW()
           ELSE finished_at
         END
   WHERE job_id = p_job_id
     AND attempt_number = v_job.attempt_count;

  IF v_job.status = 'failed_permanent' AND v_job.credits_reserved > 0 THEN
    PERFORM public.refund_document_processing_job(
      v_job.id,
      'document_processing_failed_permanent'
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_document_processing_job(
  p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.document_processing_jobs;
  v_already_settled BOOLEAN;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  SELECT credits_settled_at IS NOT NULL INTO v_already_settled
    FROM public.document_processing_jobs WHERE id = p_job_id;
  UPDATE public.document_processing_jobs
     SET credits_settled_at = COALESCE(credits_settled_at, NOW()),
         updated_at = NOW()
   WHERE id = p_job_id
     AND status = 'completed'
  RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_COMPLETED');
  END IF;
  RETURN jsonb_build_object('success', true, 'already_settled', COALESCE(v_already_settled, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_document_processing_job(
  p_job_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.document_processing_jobs;
  v_new_balance INTEGER;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  SELECT * INTO v_job
    FROM public.document_processing_jobs
   WHERE id = p_job_id
   FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_FOUND');
  END IF;
  IF v_job.credits_refunded_at IS NOT NULL OR v_job.credits_reserved = 0 THEN
    RETURN jsonb_build_object('success', true, 'already_refunded', true);
  END IF;
  IF v_job.status NOT IN ('cancelled', 'failed_permanent') THEN
    RETURN jsonb_build_object('success', false, 'code', 'JOB_NOT_REFUNDABLE');
  END IF;

  UPDATE public.profiles
     SET credits = credits + v_job.credits_reserved,
         updated_at = NOW()
   WHERE id = v_job.owner_id
  RETURNING credits INTO v_new_balance;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND');
  END IF;
  INSERT INTO public.credit_transactions
    (user_id, amount, action, balance_after, description, created_at)
  VALUES
    (v_job.owner_id, v_job.credits_reserved, 'refund'::public.credit_action,
     v_new_balance, COALESCE(NULLIF(trim(p_reason), ''), 'Document processing refund'), NOW());
  UPDATE public.document_processing_jobs
     SET credits_refunded_at = NOW(), credits_reserved = 0, updated_at = NOW()
   WHERE id = v_job.id;
  RETURN jsonb_build_object('success', true, 'refunded', true, 'balance_after', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_document_processing_job(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_document_processing_job(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_document_processing_job(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_processing_job(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_document_processing_job(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_document_processing_job(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.settle_document_processing_job(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_document_processing_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_document_processing_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_document_processing_job(UUID, TEXT) TO service_role;

COMMIT;
