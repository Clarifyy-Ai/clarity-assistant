-- Durable async paper generation: worker lease + retry columns on jobs.

BEGIN;

ALTER TABLE public.gov_paper_generation_jobs
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_gov_paper_jobs_claimable
  ON public.gov_paper_generation_jobs (status, lease_expires_at)
  WHERE status IN (
    'queued',
    'retrieving_sources',
    'analyzing_pattern',
    'planning_blueprint',
    'selecting_questions',
    'generating_questions',
    'validating_questions',
    'checking_similarity',
    'assembling'
  );

COMMENT ON COLUMN public.gov_paper_generation_jobs.worker_id IS
  'Opaque worker identity holding the current lease';
COMMENT ON COLUMN public.gov_paper_generation_jobs.lease_expires_at IS
  'Lease expiry; claimable when null or in the past';
COMMENT ON COLUMN public.gov_paper_generation_jobs.heartbeat_at IS
  'Last lease renewal / progress heartbeat';
COMMENT ON COLUMN public.gov_paper_generation_jobs.attempt_count IS
  'Number of claim/processing attempts';
COMMENT ON COLUMN public.gov_paper_generation_jobs.retryable IS
  'When false, workers must not reclaim after failure';

COMMIT;
