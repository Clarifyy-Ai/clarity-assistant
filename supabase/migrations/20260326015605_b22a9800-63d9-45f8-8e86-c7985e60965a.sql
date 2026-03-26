
-- Add missing columns to job_descriptions for JD parsing workflow
ALTER TABLE public.job_descriptions 
  ADD COLUMN IF NOT EXISTS input_method text DEFAULT 'paste',
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS parse_status text DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS parsed_data jsonb,
  ADD COLUMN IF NOT EXISTS parse_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add missing columns to scheduled_interviews for interview scheduler
ALTER TABLE public.scheduled_interviews
  ADD COLUMN IF NOT EXISTS resume_id uuid,
  ADD COLUMN IF NOT EXISTS jd_id uuid;

-- Add missing columns to interview_rounds for full round tracking
ALTER TABLE public.interview_rounds
  ADD COLUMN IF NOT EXISTS round_label text,
  ADD COLUMN IF NOT EXISTS interview_type text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS meeting_link text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS debrief_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
