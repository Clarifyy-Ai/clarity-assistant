-- Attempt answer versioning + claimable-job index for expanded FSM statuses.
-- Timestamp 20260831151000 avoids colliding with 20260831150000_gov_exam_freeze_start_rls.

ALTER TABLE public.test_responses
  ADD COLUMN IF NOT EXISTS answer_version integer NOT NULL DEFAULT 0
    CHECK (answer_version >= 0);

COMMENT ON COLUMN public.test_responses.answer_version IS
  'Monotonic write version for autosave compare-and-set.';

DROP INDEX IF EXISTS public.idx_gov_paper_jobs_claimable;

CREATE INDEX IF NOT EXISTS idx_gov_paper_jobs_claimable
  ON public.gov_paper_generation_jobs (created_at)
  WHERE retryable = true
    AND status = ANY (ARRAY[
      'queued',
      'leased',
      'checking_availability',
      'selecting',
      'generating',
      'validating',
      'assembling',
      'retrieving_sources',
      'analyzing_pattern',
      'planning_blueprint',
      'building_blueprint',
      'selecting_questions',
      'generating_questions',
      'generating_missing_slots',
      'validating_questions',
      'checking_similarity',
      'validating_paper'
    ]);
