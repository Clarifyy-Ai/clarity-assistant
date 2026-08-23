-- Government Exam E2E hardening: search indexes, exam requests,
-- job status expansions, mock_tests.expires_at, credit_reservation audit.

-- ── Search indexes ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_gov_exams_name_trgm
  ON public.gov_exams USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_gov_exams_code_lower
  ON public.gov_exams (lower(code));

CREATE INDEX IF NOT EXISTS idx_gov_exams_public_approved
  ON public.gov_exams (is_public, review_state)
  WHERE is_public = true AND review_state = 'approved';

CREATE INDEX IF NOT EXISTS idx_gov_exam_aliases_alias_trgm
  ON public.gov_exam_aliases USING gin (alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_recruiting_bodies_name_trgm
  ON public.recruiting_bodies USING gin (name gin_trgm_ops);

-- ── Exam request persistence ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_exam_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text      text NOT NULL,
  notes           text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'fulfilled'::text, 'closed'::text])),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_exam_requests_user_created
  ON public.gov_exam_requests (user_id, created_at DESC);

ALTER TABLE public.gov_exam_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gov_exam_requests_own ON public.gov_exam_requests;
CREATE POLICY gov_exam_requests_own ON public.gov_exam_requests
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS gov_exam_requests_admin ON public.gov_exam_requests;
CREATE POLICY gov_exam_requests_admin ON public.gov_exam_requests
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.gov_exam_requests IS
  'User requests for government exams not yet in the published registry.';

-- ── Job status expansions (additive; keep legacy values) ────────────────────
ALTER TABLE public.gov_paper_generation_jobs
  DROP CONSTRAINT IF EXISTS gov_paper_generation_jobs_status_check;

ALTER TABLE public.gov_paper_generation_jobs
  ADD CONSTRAINT gov_paper_generation_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text,
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
    'assembling'::text,
    'completed'::text,
    'failed'::text,
    'failed_retryable'::text,
    'failed_permanent'::text,
    'cancelled'::text,
    'expired'::text
  ]));

-- ── Server-authoritative attempt expiry ─────────────────────────────────────
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mock_tests_expires_at
  ON public.mock_tests (expires_at)
  WHERE expires_at IS NOT NULL AND status = 'IN_PROGRESS';

COMMENT ON COLUMN public.mock_tests.expires_at IS
  'Server-authoritative attempt deadline (started_at + time_limit). Client timer is display-only.';

-- ── Credit reservation audit helper (column already exists on jobs) ─────────
COMMENT ON COLUMN public.gov_paper_generation_jobs.credit_reservation IS
  'Idempotency key used for the credit deduct/reserve for this job (e.g. gov_paper:{key}).';
