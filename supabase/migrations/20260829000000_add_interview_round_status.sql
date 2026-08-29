-- Migration: add_status_to_interview_rounds
-- Add status column to interview_rounds for proper round state tracking

ALTER TABLE public.interview_rounds
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled';

ALTER TABLE public.interview_rounds
ADD COLUMN IF NOT EXISTS platform TEXT;

ALTER TABLE public.interview_rounds
ADD COLUMN IF NOT EXISTS meeting_link TEXT;

ALTER TABLE public.interview_rounds
ADD COLUMN IF NOT EXISTS round_label TEXT;

ALTER TABLE public.interview_rounds
ADD COLUMN IF NOT EXISTS interview_type TEXT;

ALTER TABLE public.interview_rounds
ADD COLUMN IF NOT EXISTS session_id UUID;

ALTER TABLE public.interview_rounds
ADD COLUMN IF NOT EXISTS debrief_id UUID;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_interview_rounds_status 
  ON public.interview_rounds(status);

-- Create composite index for scheduled_interview_id + status
CREATE INDEX IF NOT EXISTS idx_interview_rounds_interview_status 
  ON public.interview_rounds(scheduled_interview_id, status);
