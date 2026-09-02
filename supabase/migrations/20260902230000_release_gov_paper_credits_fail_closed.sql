-- Fail closed: do not mark paper-job credits released unless refund_credits succeeds.

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
    RETURN jsonb_build_object('success', true, 'already_released', true, 'released', 0);
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

  IF COALESCE((v_refund->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'REFUND_FAILED',
      'released', 0,
      'amount', v_amount,
      'refund', v_refund
    );
  END IF;

  UPDATE public.gov_paper_generation_jobs
     SET credits_released_at = NOW(),
         credits_reserved = 0,
         credits_charged = 0,
         updated_at = NOW()
   WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'released', v_amount,
    'refund', v_refund
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_gov_paper_credits(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_gov_paper_credits(uuid, text) TO service_role;
