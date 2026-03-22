-- ─── Calendar sync: add missing columns for Google Calendar integration ───────

-- Add calendar_event_id to scheduled_interviews for deduplication on sync
ALTER TABLE public.scheduled_interviews
  ADD COLUMN IF NOT EXISTS calendar_event_id      TEXT,
  ADD COLUMN IF NOT EXISTS calendar_provider      TEXT,
  ADD COLUMN IF NOT EXISTS resume_id              UUID,
  ADD COLUMN IF NOT EXISTS jd_id                  UUID,
  ADD COLUMN IF NOT EXISTS company_research_id    UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_interviews_calendar_event
  ON public.scheduled_interviews (user_id, calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

-- Add missing columns to interview_rounds to match application types
ALTER TABLE public.interview_rounds
  ADD COLUMN IF NOT EXISTS round_label    TEXT,
  ADD COLUMN IF NOT EXISTS interview_type TEXT,
  ADD COLUMN IF NOT EXISTS platform       TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link   TEXT,
  ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS session_id     UUID,
  ADD COLUMN IF NOT EXISTS debrief_id     UUID,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();
