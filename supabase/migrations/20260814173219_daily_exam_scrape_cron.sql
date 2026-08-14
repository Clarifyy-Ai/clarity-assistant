-- Daily official PYQ scrape via pg_cron → Edge Function run-daily-exam-scrape.
-- Auth secret lives in Vault (exam_scrape_cron_secret), not in this file.
-- Seed Vault with: node scripts/setup-daily-exam-scrape-cron.mjs

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO postgres;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_daily_exam_scrape(p_exam_type text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  project_url text;
  cron_secret text;
  request_id bigint;
  exam_id text;
BEGIN
  exam_id := upper(btrim(coalesce(p_exam_type, '')));
  IF exam_id = '' THEN
    RAISE WARNING 'invoke_daily_exam_scrape: empty exam_type';
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  IF project_url IS NULL OR btrim(project_url) = '' THEN
    project_url := 'https://qzgvjrvtkwlzxpmlddkx.supabase.co';
  END IF;

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'exam_scrape_cron_secret'
  LIMIT 1;

  IF cron_secret IS NULL OR length(cron_secret) < 16 THEN
    RAISE WARNING 'invoke_daily_exam_scrape skipped: vault secret exam_scrape_cron_secret is missing';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/run-daily-exam-scrape',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', cron_secret
    ),
    body := jsonb_build_object(
      'exam_type', exam_id,
      'source', 'pg_cron'
    ),
    timeout_milliseconds := 180000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_daily_exam_scrape(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.invoke_daily_exam_scrape(text) FROM anon;
REVOKE ALL ON FUNCTION private.invoke_daily_exam_scrape(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_daily_exam_scrape(text) TO postgres;
GRANT EXECUTE ON FUNCTION private.invoke_daily_exam_scrape(text) TO service_role;

DO $$
DECLARE
  n text;
BEGIN
  FOREACH n IN ARRAY ARRAY[
    'daily-exam-scrape-jee-main',
    'daily-exam-scrape-neet',
    'daily-exam-scrape-upsc',
    'daily-exam-scrape-ssc-cgl',
    'daily-exam-scrape-ibps-po'
  ]
  LOOP
    BEGIN
      PERFORM cron.unschedule(n);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

SELECT cron.schedule(
  'daily-exam-scrape-jee-main',
  '0 2 * * *',
  $$ SELECT private.invoke_daily_exam_scrape('JEE_MAIN'); $$
);

SELECT cron.schedule(
  'daily-exam-scrape-neet',
  '20 2 * * *',
  $$ SELECT private.invoke_daily_exam_scrape('NEET'); $$
);

SELECT cron.schedule(
  'daily-exam-scrape-upsc',
  '40 2 * * *',
  $$ SELECT private.invoke_daily_exam_scrape('UPSC'); $$
);

SELECT cron.schedule(
  'daily-exam-scrape-ssc-cgl',
  '0 3 * * *',
  $$ SELECT private.invoke_daily_exam_scrape('SSC_CGL'); $$
);

SELECT cron.schedule(
  'daily-exam-scrape-ibps-po',
  '20 3 * * *',
  $$ SELECT private.invoke_daily_exam_scrape('IBPS_PO'); $$
);
