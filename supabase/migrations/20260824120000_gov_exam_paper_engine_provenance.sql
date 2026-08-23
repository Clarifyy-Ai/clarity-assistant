-- Government Exam Paper Engine: provenance, source mix, stuck-job terminalization.
-- Does not fabricate official PYQ claims; tracks honest source classes.

-- ── Question-level source_type (additive; existing `source` text remains) ─────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'questions_source_type_check'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_source_type_check
      CHECK (
        source_type IS NULL OR source_type IN (
          'official_verified',
          'verified_public_source',
          'approved_bank',
          'generated_practice',
          'ai_generated_practice',
          'admin_uploaded',
          'internal_question_bank'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.questions.source_type IS
  'Provenance class for government-exam bank items. Never label generated_practice/ai_generated_practice as official.';

-- Backfill from legacy `source` where safe (avoid license publish trigger)
UPDATE public.questions
SET source_type = CASE
  WHEN upper(coalesce(source, '')) IN ('OFFICIAL_PYP', 'OFFICIAL', 'PREVIOUS_YEAR', 'PYQ')
    THEN 'official_verified'
  WHEN upper(coalesce(source, '')) IN ('DETERMINISTIC_PRACTICE', 'GENERATED_PRACTICE')
    THEN 'generated_practice'
  WHEN upper(coalesce(source, '')) LIKE '%AI%'
    THEN 'ai_generated_practice'
  WHEN is_verified = true AND is_public = true
    THEN 'approved_bank'
  ELSE coalesce(source_type, 'approved_bank')
END
WHERE source_type IS NULL
  AND exam_type IS NOT NULL
  AND (
    coalesce(publish_status, 'draft') IS DISTINCT FROM 'published'
    OR coalesce(license_type, 'UNKNOWN') <> 'UNKNOWN'
  );

CREATE INDEX IF NOT EXISTS questions_source_type_idx
  ON public.questions (source_type)
  WHERE source_type IS NOT NULL;

-- ── Paper-level source mix + honest paper_source ─────────────────────────────
ALTER TABLE public.gov_generated_papers
  ADD COLUMN IF NOT EXISTS paper_source text,
  ADD COLUMN IF NOT EXISTS source_mix jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gov_generated_papers_paper_source_check'
  ) THEN
    ALTER TABLE public.gov_generated_papers
      ADD CONSTRAINT gov_generated_papers_paper_source_check
      CHECK (
        paper_source IS NULL OR paper_source IN (
          'official_verified',
          'verified_public_source',
          'approved_bank',
          'generated_practice',
          'ai_generated_practice',
          'hybrid_realistic_mock'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.gov_generated_papers.paper_source IS
  'Dominant/overall paper provenance. hybrid_realistic_mock = mixed bank + practice fill.';
COMMENT ON COLUMN public.gov_generated_papers.source_mix IS
  'Counts by source class, e.g. {"official_verified":40,"approved_bank":35,"generated_practice":15,"ai_generated_practice":10}';

-- Finer question provenance on paper links (keeps legacy source_class CHECK)
ALTER TABLE public.gov_generated_paper_questions
  ADD COLUMN IF NOT EXISTS question_source_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gov_paper_q_question_source_type_check'
  ) THEN
    ALTER TABLE public.gov_generated_paper_questions
      ADD CONSTRAINT gov_paper_q_question_source_type_check
      CHECK (
        question_source_type IS NULL OR question_source_type IN (
          'official_verified',
          'verified_public_source',
          'approved_bank',
          'generated_practice',
          'ai_generated_practice'
        )
      );
  END IF;
END $$;

-- ── Job observability: source mix snapshot + terminal stuck-job sweeper ──────
ALTER TABLE public.gov_paper_generation_jobs
  ADD COLUMN IF NOT EXISTS source_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_count integer;

CREATE OR REPLACE FUNCTION public.terminate_stuck_gov_paper_jobs(
  p_max_age_minutes integer DEFAULT 45
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Non-terminal jobs past lease/age → failed_retryable (never leave GENERATING forever)
  WITH stuck AS (
    UPDATE public.gov_paper_generation_jobs j
    SET
      status = 'failed_retryable',
      progress_stage = 'failed_retryable',
      error_code = coalesce(nullif(j.error_code, ''), 'JOB_STUCK_TIMEOUT'),
      error_message = coalesce(
        nullif(j.error_message, ''),
        'Paper generation timed out and was marked failed_retryable. Retry is safe.'
      ),
      retryable = true,
      lease_expires_at = NULL,
      updated_at = now()
    WHERE j.status NOT IN (
      'completed', 'failed', 'failed_retryable', 'failed_permanent', 'cancelled', 'expired'
    )
      AND j.created_at < now() - make_interval(mins => greatest(5, p_max_age_minutes))
      AND (
        j.lease_expires_at IS NULL
        OR j.lease_expires_at < now() - interval '5 minutes'
      )
    RETURNING j.id
  )
  SELECT count(*)::integer INTO v_count FROM stuck;
  RETURN coalesce(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.terminate_stuck_gov_paper_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terminate_stuck_gov_paper_jobs(integer) TO service_role;

COMMENT ON FUNCTION public.terminate_stuck_gov_paper_jobs(integer) IS
  'Marks abandoned non-terminal gov paper jobs as failed_retryable so UI never spins forever.';
