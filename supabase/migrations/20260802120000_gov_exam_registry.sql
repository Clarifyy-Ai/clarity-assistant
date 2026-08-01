-- Government Exam Registry + paper-generation jobs (source-grounded engine).
-- Extends mock_test_engine; does not replace questions / mock_tests.

BEGIN;

-- ── Recruiting bodies ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recruiting_bodies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  jurisdiction  text NOT NULL DEFAULT 'central', -- central | state | ut
  official_url  text,
  disclaimer_note text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Exams (configurable registry) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_exams (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiting_body_id  uuid NOT NULL REFERENCES public.recruiting_bodies(id),
  code                text NOT NULL UNIQUE, -- SSC_CGL, RRB_NTPC, IBPS_PO, UPSC_CSE_PRELIMS
  name                text NOT NULL,
  family              text NOT NULL, -- ssc | railways | banking | upsc | state_psc | defence | teaching | other
  description         text,
  legacy_exam_type    text, -- maps to questions.exam_type storage string
  review_state        text NOT NULL DEFAULT 'draft'
                      CHECK (review_state IN ('draft','in_review','approved','retired')),
  is_public           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gov_exam_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  UNIQUE (exam_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_gov_exam_aliases_alias_lower
  ON public.gov_exam_aliases (lower(alias));

-- ── Stages / pattern / syllabus versions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_exam_stages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  code          text NOT NULL, -- TIER_I, PRELIMS, CBT_1
  name          text NOT NULL,
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE (exam_id, code)
);

CREATE TABLE IF NOT EXISTS public.gov_exam_pattern_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id             uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  stage_id            uuid NOT NULL REFERENCES public.gov_exam_stages(id) ON DELETE CASCADE,
  version             text NOT NULL,
  effective_date      date,
  total_questions     int NOT NULL,
  total_marks         numeric NOT NULL,
  duration_minutes    int NOT NULL,
  negative_mark       numeric NOT NULL DEFAULT 0,
  marks_per_question  numeric NOT NULL DEFAULT 1,
  languages           text[] NOT NULL DEFAULT ARRAY['en']::text[],
  source_url          text,
  review_state        text NOT NULL DEFAULT 'draft'
                      CHECK (review_state IN ('draft','in_review','approved','retired')),
  superseded_by       uuid REFERENCES public.gov_exam_pattern_versions(id),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, version)
);

CREATE TABLE IF NOT EXISTS public.gov_exam_sections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_version_id  uuid NOT NULL REFERENCES public.gov_exam_pattern_versions(id) ON DELETE CASCADE,
  code                text NOT NULL,
  name                text NOT NULL,
  question_count      int NOT NULL,
  marks               numeric NOT NULL,
  sort_order          int NOT NULL DEFAULT 0,
  UNIQUE (pattern_version_id, code)
);

CREATE TABLE IF NOT EXISTS public.gov_exam_syllabus_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id             uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  stage_id            uuid NOT NULL REFERENCES public.gov_exam_stages(id) ON DELETE CASCADE,
  version             text NOT NULL,
  effective_date      date,
  source_url          text,
  review_state        text NOT NULL DEFAULT 'draft'
                      CHECK (review_state IN ('draft','in_review','approved','retired')),
  topics_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, version)
);

-- ── Official sources (provenance) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_official_sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiting_body_id  uuid REFERENCES public.recruiting_bodies(id),
  exam_id             uuid REFERENCES public.gov_exams(id),
  document_type       text NOT NULL, -- notification | syllabus | pattern | previous_paper | answer_key | corrigendum
  title               text NOT NULL,
  source_url          text,
  is_official         boolean NOT NULL DEFAULT true,
  publication_date    date,
  effective_date      date,
  retrieved_at        timestamptz NOT NULL DEFAULT now(),
  file_hash           text,
  mime_type           text,
  language            text DEFAULT 'en',
  license_class       text NOT NULL DEFAULT 'official_public'
                      CHECK (license_class IN (
                        'official_public','licensed','user_upload','institution','ai_generated','unknown'
                      )),
  review_state        text NOT NULL DEFAULT 'draft'
                      CHECK (review_state IN ('draft','in_review','approved','retired','rejected')),
  superseded_by       uuid REFERENCES public.gov_official_sources(id),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Paper generation jobs + assembled papers ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_paper_generation_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id             uuid NOT NULL REFERENCES public.gov_exams(id),
  stage_id            uuid REFERENCES public.gov_exam_stages(id),
  pattern_version_id  uuid REFERENCES public.gov_exam_pattern_versions(id),
  syllabus_version_id uuid REFERENCES public.gov_exam_syllabus_versions(id),
  mode                text NOT NULL
                      CHECK (mode IN (
                        'official_previous','generated_mock','custom_mock','adaptive'
                      )),
  language            text NOT NULL DEFAULT 'en',
  request_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  blueprint_json      jsonb,
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','retrieving_sources','analyzing_pattern','planning_blueprint',
                        'selecting_questions','generating_questions','validating_questions',
                        'checking_similarity','assembling','completed','failed','cancelled','expired'
                      )),
  progress_stage      text,
  mock_test_id        uuid, -- links to mock_tests when assembled
  generated_paper_id  uuid,
  error_code          text,
  error_message       text,
  idempotency_key     text,
  credit_reservation  text,
  credits_charged     int NOT NULL DEFAULT 0,
  random_seed         text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_paper_jobs_idempotency
  ON public.gov_paper_generation_jobs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gov_paper_jobs_user_created
  ON public.gov_paper_generation_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.gov_generated_papers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id             uuid NOT NULL REFERENCES public.gov_exams(id),
  stage_id            uuid REFERENCES public.gov_exam_stages(id),
  pattern_version_id  uuid REFERENCES public.gov_exam_pattern_versions(id),
  syllabus_version_id uuid REFERENCES public.gov_exam_syllabus_versions(id),
  job_id              uuid REFERENCES public.gov_paper_generation_jobs(id),
  created_by          uuid REFERENCES auth.users(id),
  title               text NOT NULL,
  paper_class         text NOT NULL DEFAULT 'ai_generated'
                      CHECK (paper_class IN (
                        'official_previous','reconstructed','ai_generated','custom_practice'
                      )),
  language            text NOT NULL DEFAULT 'en',
  question_count      int NOT NULL,
  total_marks         numeric NOT NULL,
  duration_minutes    int NOT NULL,
  negative_mark       numeric NOT NULL DEFAULT 0,
  blueprint_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_score       numeric,
  review_state        text NOT NULL DEFAULT 'machine_validated'
                      CHECK (review_state IN (
                        'draft','machine_validated','needs_review','expert_reviewed',
                        'approved','rejected','retired'
                      )),
  disclaimer          text NOT NULL DEFAULT
    'AI-generated practice paper based on the selected syllabus, pattern, and historical topic distribution. This is not an official or leaked examination paper.',
  mock_test_id        uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gov_generated_paper_questions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id            uuid NOT NULL REFERENCES public.gov_generated_papers(id) ON DELETE CASCADE,
  question_id         uuid NOT NULL REFERENCES public.questions(id),
  section_code        text,
  sort_order          int NOT NULL DEFAULT 0,
  source_class        text NOT NULL DEFAULT 'bank'
                      CHECK (source_class IN ('bank','generated','previous_year')),
  UNIQUE (paper_id, question_id)
);

-- ── User preferences ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_gov_exam_preferences (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target_exam_id      uuid REFERENCES public.gov_exams(id),
  target_stage_id     uuid REFERENCES public.gov_exam_stages(id),
  preferred_language  text NOT NULL DEFAULT 'en',
  recent_searches     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.recruiting_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_pattern_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_syllabus_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_official_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_paper_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_generated_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_generated_paper_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_gov_exam_preferences ENABLE ROW LEVEL SECURITY;

-- Public catalog: approved / public rows readable by authenticated users
CREATE POLICY gov_recruiting_bodies_select ON public.recruiting_bodies
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY gov_exams_select ON public.gov_exams
  FOR SELECT TO authenticated
  USING (is_public = true AND review_state = 'approved');

CREATE POLICY gov_exam_aliases_select ON public.gov_exam_aliases
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gov_exams e
    WHERE e.id = exam_id AND e.is_public AND e.review_state = 'approved'
  ));

CREATE POLICY gov_exam_stages_select ON public.gov_exam_stages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gov_exams e
    WHERE e.id = exam_id AND e.is_public AND e.review_state = 'approved'
  ));

CREATE POLICY gov_pattern_select ON public.gov_exam_pattern_versions
  FOR SELECT TO authenticated
  USING (review_state = 'approved');

CREATE POLICY gov_sections_select ON public.gov_exam_sections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gov_exam_pattern_versions p
    WHERE p.id = pattern_version_id AND p.review_state = 'approved'
  ));

CREATE POLICY gov_syllabus_select ON public.gov_exam_syllabus_versions
  FOR SELECT TO authenticated
  USING (review_state = 'approved');

CREATE POLICY gov_sources_select ON public.gov_official_sources
  FOR SELECT TO authenticated
  USING (review_state = 'approved');

CREATE POLICY gov_jobs_own ON public.gov_paper_generation_jobs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY gov_papers_select ON public.gov_generated_papers
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR review_state IN ('approved','machine_validated','expert_reviewed')
  );

CREATE POLICY gov_paper_q_select ON public.gov_generated_paper_questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gov_generated_papers p
    WHERE p.id = paper_id
      AND (p.created_by = auth.uid()
           OR p.review_state IN ('approved','machine_validated','expert_reviewed'))
  ));

CREATE POLICY gov_user_prefs_own ON public.user_gov_exam_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
