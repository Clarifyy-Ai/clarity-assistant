-- Schedule retention cleanup jobs (pg_cron enabled in 20260418165858 migration).

--------------------------------------------------------------------------------
-- 1. Purge expired idempotency_log rows (dedupe cache from edge functions)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_expired_idempotency_log()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH expired AS (
    DELETE FROM public.idempotency_log
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM expired;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_idempotency_log() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_idempotency_log() FROM authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_idempotency_log() FROM anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_idempotency_log() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-expired-idempotency-log-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-idempotency-log-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-expired-idempotency-log-daily',
  '15 4 * * *',
  $$ SELECT public.purge_expired_idempotency_log(); $$
);

--------------------------------------------------------------------------------
-- 2. Hard-delete soft-deleted documents past retention window
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.cleanup_expired_documents()') IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule('cleanup-expired-documents-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-documents-daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'cleanup-expired-documents-daily',
      '30 4 * * *',
      $cron$ SELECT public.cleanup_expired_documents(); $cron$
    );
  END IF;
END $$;
