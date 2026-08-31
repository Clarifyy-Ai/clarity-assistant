-- Expand job status check so Edge claim/assemble can persist validating + later stages.
ALTER TABLE public.gov_paper_generation_jobs
  DROP CONSTRAINT IF EXISTS gov_paper_generation_jobs_status_check;

ALTER TABLE public.gov_paper_generation_jobs
  ADD CONSTRAINT gov_paper_generation_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text,
    'leased'::text,
    'selecting'::text,
    'generating'::text,
    'validating'::text,
    'retrieving_sources'::text,
    'analyzing_pattern'::text,
    'planning_blueprint'::text,
    'building_blueprint'::text,
    'selecting_questions'::text,
    'generating_questions'::text,
    'generating_missing_slots'::text,
    'validating_questions'::text,
    'checking_similarity'::text,
    'validating_paper'::text,
    'assembling'::text,
    'completed'::text,
    'failed'::text,
    'failed_retryable'::text,
    'failed_permanent'::text,
    'cancelled'::text,
    'expired'::text
  ]));
