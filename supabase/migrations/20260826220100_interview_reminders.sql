-- Interview email reminder queue (T-24h / T-1h / confirmation).
-- Enqueued by schedule-interview when RESEND_API_KEY is configured.
-- Processed by edge function send-interview-reminders (cron-invoked).
--
-- ─── pg_cron setup (same pattern as 20260814173219_daily_exam_scrape_cron.sql) ───
-- Seed Vault: project_url + interview_reminder_cron_secret (min 16 chars; mirror
-- Edge secret CRON_SECRET or INTERNAL_WORKER_SECRET). Then:
--
--   CREATE SCHEMA IF NOT EXISTS private;
--   CREATE OR REPLACE FUNCTION private.invoke_send_interview_reminders()
--   RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
--   DECLARE project_url text; cron_secret text; request_id bigint;
--   BEGIN
--     SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets
--       WHERE name = 'project_url' LIMIT 1;
--     SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets
--       WHERE name = 'interview_reminder_cron_secret' LIMIT 1;
--     IF cron_secret IS NULL OR length(cron_secret) < 16 THEN
--       RAISE WARNING 'invoke_send_interview_reminders skipped: missing vault secret';
--       RETURN NULL;
--     END IF;
--     SELECT net.http_post(
--       url := rtrim(project_url, '/') || '/functions/v1/send-interview-reminders',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-internal-secret', cron_secret
--       ),
--       body := jsonb_build_object('source', 'pg_cron'),
--       timeout_milliseconds := 60000
--     ) INTO request_id;
--     RETURN request_id;
--   END;
--   $$;
--
--   SELECT cron.schedule(
--     'send-interview-reminders-every-15m',
--     '*/15 * * * *',
--     $$ SELECT private.invoke_send_interview_reminders(); $$
--   );
--
-- Alternative: GitHub Actions / Dashboard cron POST to the same endpoint with
-- header x-internal-secret matching CRON_SECRET or INTERNAL_WORKER_SECRET.

CREATE TABLE IF NOT EXISTS public.interview_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id  UUID NOT NULL REFERENCES public.scheduled_interviews(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remind_at     TIMESTAMPTZ NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('t24h', 't1h', 'confirmation')),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'failed')),
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (interview_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_interview_reminders_due
  ON public.interview_reminders (status, remind_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_interview_reminders_user
  ON public.interview_reminders (user_id);

COMMENT ON TABLE public.interview_reminders IS
  'Queued interview email reminders. Worker: send-interview-reminders edge function (see migration header for pg_cron).';

ALTER TABLE public.interview_reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.interview_reminders FROM PUBLIC;
REVOKE ALL ON TABLE public.interview_reminders FROM anon;
GRANT SELECT ON TABLE public.interview_reminders TO authenticated;
GRANT ALL ON TABLE public.interview_reminders TO service_role;
GRANT ALL ON TABLE public.interview_reminders TO postgres;

DROP POLICY IF EXISTS "Users can read own interview reminders"
  ON public.interview_reminders;
CREATE POLICY "Users can read own interview reminders"
  ON public.interview_reminders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
