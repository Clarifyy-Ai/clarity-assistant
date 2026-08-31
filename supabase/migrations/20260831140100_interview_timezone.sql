-- Persist the IANA timezone chosen at schedule time so refresh/edit/email
-- round-trip the same wall clock instead of reverting to UTC / browser local.
-- Filename timestamp is after 20260831140000_gov_paper_job_status_check_expand
-- so the two 20260831140000_* files no longer collide.

ALTER TABLE public.interview_rounds
  ADD COLUMN IF NOT EXISTS timezone text;

ALTER TABLE public.scheduled_interviews
  ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.interview_rounds.timezone IS
  'IANA timezone (e.g. Asia/Kolkata) for scheduled_at wall-clock display.';
COMMENT ON COLUMN public.scheduled_interviews.timezone IS
  'IANA timezone denormalized from the current/next round.';
