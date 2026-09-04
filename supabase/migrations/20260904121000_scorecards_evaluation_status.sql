-- Durable scorecard evaluation status (Genuine Scorecard Phase 3).
-- Scores remain null until evaluation completes — never invent zeros.

ALTER TABLE public.scorecards
  ADD COLUMN IF NOT EXISTS evaluation_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS eligibility_reason text,
  ADD COLUMN IF NOT EXISTS question_count integer,
  ADD COLUMN IF NOT EXISTS answer_count integer,
  ADD COLUMN IF NOT EXISTS evaluated_answer_count integer,
  ADD COLUMN IF NOT EXISTS rubric_version text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scorecards_evaluation_status_check'
  ) THEN
    ALTER TABLE public.scorecards
      ADD CONSTRAINT scorecards_evaluation_status_check
      CHECK (
        evaluation_status = ANY (
          ARRAY[
            'not_requested'::text,
            'not_eligible'::text,
            'queued'::text,
            'processing'::text,
            'completed'::text,
            'failed_retryable'::text,
            'failed_permanent'::text
          ]
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.scorecards.evaluation_status IS
  'Durable scorecard job status: not_requested | not_eligible | queued | processing | completed | failed_retryable | failed_permanent';
COMMENT ON COLUMN public.scorecards.eligibility_reason IS
  'Typed eligibility / failure code (e.g. NOT_ELIGIBLE_NO_ANSWERS, EVALUATION_FAILED).';
COMMENT ON COLUMN public.scorecards.question_count IS
  'Questions associated with the session at evaluation time.';
COMMENT ON COLUMN public.scorecards.answer_count IS
  'Scorable answers at evaluation time (excludes skipped/empty).';
COMMENT ON COLUMN public.scorecards.evaluated_answer_count IS
  'Answers that received persisted question-level scores.';
COMMENT ON COLUMN public.scorecards.rubric_version IS
  'Rubric / model version used for the latest evaluation attempt.';
COMMENT ON COLUMN public.scorecards.attempt_count IS
  'Number of evaluation attempts for this session scorecard.';
COMMENT ON COLUMN public.scorecards.last_error_code IS
  'Last failure code when evaluation_status is failed_*.';

-- Backfill completed rows that already have an overall score.
UPDATE public.scorecards
SET evaluation_status = 'completed'
WHERE evaluation_status = 'not_requested'
  AND overall_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scorecards_evaluation_status
  ON public.scorecards (evaluation_status);
