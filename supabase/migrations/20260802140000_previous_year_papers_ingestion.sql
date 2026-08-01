-- Previous-year papers + durable source ingestion jobs.
-- Link-first / admin-upload only — no unauthorized scraping payloads.
-- Prefer empty previous_year_papers bank over synthetic seeds.

BEGIN;

-- Optional storage pointer on official sources (admin-authorized upload path)
ALTER TABLE public.gov_official_sources
  ADD COLUMN IF NOT EXISTS storage_path text;

COMMENT ON COLUMN public.gov_official_sources.storage_path IS
  'Optional Supabase Storage object path for admin-authorized uploads. Never populated by public scrapers.';

-- ── Previous-year paper registry ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.previous_year_papers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id               uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  stage_id              uuid REFERENCES public.gov_exam_stages(id) ON DELETE SET NULL,
  year                  int NOT NULL CHECK (year >= 1990 AND year <= 2100),
  cycle                 text,                         -- e.g. 2024-25, Jan, Prelims
  tier                  text,                         -- Tier I / CBT-1 / Prelims
  shift                 text,
  language              text NOT NULL DEFAULT 'en',
  duration_minutes      int,
  marking               jsonb NOT NULL DEFAULT '{}'::jsonb, -- {positive, negative, ...}
  question_count        int,
  source_id             uuid REFERENCES public.gov_official_sources(id) ON DELETE SET NULL,
  official_status       text NOT NULL DEFAULT 'unverified'
                        CHECK (official_status IN (
                          'unverified','link_only','admin_attested','official_verified'
                        )),
  answer_key_status     text NOT NULL DEFAULT 'none'
                        CHECK (answer_key_status IN (
                          'none','provisional','final','unavailable','not_applicable'
                        )),
  review_status         text NOT NULL DEFAULT 'draft'
                        CHECK (review_status IN (
                          'draft','synthetic','in_review','approved','rejected','retired'
                        )),
  pattern_version_id    uuid REFERENCES public.gov_exam_pattern_versions(id) ON DELETE SET NULL,
  syllabus_version_id   uuid REFERENCES public.gov_exam_syllabus_versions(id) ON DELETE SET NULL,
  title                 text,
  notes                 text,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pyp_exam_year
  ON public.previous_year_papers (exam_id, year DESC);

CREATE INDEX IF NOT EXISTS idx_pyp_stage_year
  ON public.previous_year_papers (stage_id, year DESC)
  WHERE stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pyp_review
  ON public.previous_year_papers (review_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pyp_exam_year_shift_lang
  ON public.previous_year_papers (
    exam_id,
    year,
    COALESCE(stage_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(shift, ''),
    language
  );

-- ── Paper ↔ question link ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.previous_year_paper_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id      uuid NOT NULL REFERENCES public.previous_year_papers(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  sort_order    int NOT NULL DEFAULT 0,
  page_ref      text,
  section_code  text,
  UNIQUE (paper_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_pypq_paper_sort
  ON public.previous_year_paper_questions (paper_id, sort_order);

-- ── Durable ingestion jobs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.source_ingestion_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES public.gov_official_sources(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN (
                    'queued','validating_url','registering_source','awaiting_payload',
                    'validating_questions','inserting_questions','linking_paper',
                    'completed','failed','cancelled'
                  )),
  error           text,
  parser_version  text NOT NULL DEFAULT '1.0.0',
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  paper_id        uuid REFERENCES public.previous_year_papers(id) ON DELETE SET NULL,
  questions_imported int NOT NULL DEFAULT 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_source
  ON public.source_ingestion_jobs (source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status
  ON public.source_ingestion_jobs (status)
  WHERE status NOT IN ('completed','cancelled');

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.previous_year_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.previous_year_paper_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_ingestion_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pyp_select_approved ON public.previous_year_papers;
CREATE POLICY pyp_select_approved ON public.previous_year_papers
  FOR SELECT TO authenticated
  USING (review_status = 'approved');

DROP POLICY IF EXISTS pyp_admin_all ON public.previous_year_papers;
CREATE POLICY pyp_admin_all ON public.previous_year_papers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS pypq_select_approved ON public.previous_year_paper_questions;
CREATE POLICY pypq_select_approved ON public.previous_year_paper_questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.previous_year_papers p
    WHERE p.id = paper_id AND p.review_status = 'approved'
  ));

DROP POLICY IF EXISTS pypq_admin_all ON public.previous_year_paper_questions;
CREATE POLICY pypq_admin_all ON public.previous_year_paper_questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Ingestion jobs: admins only (service role used by edge functions)
DROP POLICY IF EXISTS ingest_jobs_admin ON public.source_ingestion_jobs;
CREATE POLICY ingest_jobs_admin ON public.source_ingestion_jobs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.previous_year_papers IS
  'Registry of previous-year / official paper metadata. Empty by design for pilot — populate via admin ingest-source-document only. Do not seed synthetic papers unless review_status=synthetic.';

COMMENT ON TABLE public.source_ingestion_jobs IS
  'Durable admin ingestion jobs. Pilot accepts metadata + optional storage path / structured JSON; does not download when robots/terms are unknown.';

-- No synthetic previous_year_papers rows seeded here (prefer empty bank).

COMMIT;
