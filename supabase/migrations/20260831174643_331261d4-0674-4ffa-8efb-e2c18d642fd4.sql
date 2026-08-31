-- lovable-cron-fallback-reviewed: 96 runs/day; stuck job detection has no triggering row change, and stranded user credits must be returned within ~15 minutes of timeout
CREATE OR REPLACE FUNCTION public.reap_stuck_gov_paper_jobs(p_max_age_minutes integer DEFAULT 45)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reaped integer := 0;
  v_released integer := 0;
  v_credits integer := 0;
  r RECORD;
BEGIN
  -- 1) Non-terminal jobs past age with no live lease -> failed_retryable
  WITH stuck AS (
    UPDATE public.gov_paper_generation_jobs j
    SET
      status = 'failed_retryable',
      progress_stage = 'failed_retryable',
      error_code = coalesce(nullif(j.error_code, ''), 'JOB_STUCK_TIMEOUT'),
      error_message = coalesce(
        nullif(j.error_message, ''),
        'Paper generation timed out and was marked failed_retryable. Retry is safe.'
      ),
      retryable = true,
      lease_expires_at = NULL,
      updated_at = now()
    WHERE j.status NOT IN (
      'completed', 'failed', 'failed_retryable', 'failed_permanent', 'cancelled', 'expired'
    )
      AND j.created_at < now() - make_interval(mins => greatest(5, p_max_age_minutes))
      AND (j.lease_expires_at IS NULL OR j.lease_expires_at < now() - interval '5 minutes')
    RETURNING j.id
  )
  SELECT count(*)::integer INTO v_reaped FROM stuck;

  -- 2) Release stranded reservations on any terminal-failed/cancelled job.
  FOR r IN
    SELECT id, user_id,
           GREATEST(coalesce(credits_reserved, 0), coalesce(credits_charged, 0)) AS amount
      FROM public.gov_paper_generation_jobs
     WHERE status IN ('failed', 'failed_retryable', 'failed_permanent', 'cancelled', 'expired')
       AND credits_released_at IS NULL
       AND credits_finalized_at IS NULL
       AND GREATEST(coalesce(credits_reserved, 0), coalesce(credits_charged, 0)) > 0
     ORDER BY created_at
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.refund_credits(
      r.user_id,
      r.amount,
      'refund_paper_job_reaper:' || r.id::text,
      NULL
    );

    UPDATE public.gov_paper_generation_jobs
       SET credits_released_at = now(),
           credits_reserved = 0,
           credits_charged = 0,
           updated_at = now()
     WHERE id = r.id;

    v_released := v_released + 1;
    v_credits := v_credits + r.amount;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reaped', v_reaped,
    'credit_releases', v_released,
    'credits_returned', v_credits
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reap_stuck_gov_paper_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stuck_gov_paper_jobs(integer) TO service_role;

SELECT cron.unschedule('reap-stuck-gov-paper-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reap-stuck-gov-paper-jobs');

SELECT cron.schedule(
  'reap-stuck-gov-paper-jobs',
  '*/15 * * * *',
  $$SELECT public.reap_stuck_gov_paper_jobs(45);$$
);