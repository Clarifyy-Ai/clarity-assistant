-- Interview reminder worker via pg_cron → send-interview-reminders.
-- Auth secret lives in Vault (interview_reminder_cron_secret), not in this file.
-- Seed Vault with the same value as Edge CRON_SECRET or INTERNAL_WORKER_SECRET.
-- Skips the HTTP call (WARNING only) when the vault secret is missing.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO postgres;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_send_interview_reminders()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  project_url text;
  cron_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  IF project_url IS NULL OR btrim(project_url) = '' THEN
    project_url := 'https://qzgvjrvtkwlzxpmlddkx.supabase.co';
  END IF;

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'interview_reminder_cron_secret'
  LIMIT 1;

  IF cron_secret IS NULL OR length(cron_secret) < 16 THEN
    RAISE WARNING 'invoke_send_interview_reminders skipped: vault secret interview_reminder_cron_secret is missing';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-interview-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', cron_secret
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 60000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_send_interview_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.invoke_send_interview_reminders() FROM anon;
REVOKE ALL ON FUNCTION private.invoke_send_interview_reminders() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_send_interview_reminders() TO postgres;
GRANT EXECUTE ON FUNCTION private.invoke_send_interview_reminders() TO service_role;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('send-interview-reminders-every-15m');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(
  'send-interview-reminders-every-15m',
  '*/15 * * * *',
  $$ SELECT private.invoke_send_interview_reminders(); $$
);
