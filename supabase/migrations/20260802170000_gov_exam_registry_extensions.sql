-- Government exam registry extensions (families, cycles, topics, languages,
-- rules, provenance, reviews, quality incidents, source conflicts).
-- Idempotent: safe if a thinner first apply already created base tables.
-- Keeps gov_exams.family as text; seeds exam_families and links via FK.

BEGIN;

-- ── Exam family lookup ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_families
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

INSERT INTO public.exam_families (code, name, sort_order) VALUES
  ('ssc',       'Staff Selection Commission', 10),
  ('railways',  'Railways', 20),
  ('banking',   'Banking & Finance', 30),
  ('upsc',      'UPSC / Civil Services', 40),
  ('state_psc', 'State PSC', 50),
  ('defence',   'Defence', 60),
  ('teaching',  'Teaching', 70),
  ('other',     'Other', 90)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;

-- Ensure any existing gov_exams.family codes exist before FK
INSERT INTO public.exam_families (code, name, sort_order)
SELECT DISTINCT e.family, initcap(replace(e.family, '_', ' ')), 100
FROM public.gov_exams e
WHERE e.family IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.exam_families f WHERE f.code = e.family
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gov_exams_family_fkey'
  ) THEN
    ALTER TABLE public.gov_exams
      ADD CONSTRAINT gov_exams_family_fkey
      FOREIGN KEY (family) REFERENCES public.exam_families(code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gov_exams_family
  ON public.gov_exams (family);

-- ── Exam cycles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_exam_cycles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  code            text NOT NULL,
  name            text NOT NULL,
  year            int,
  effective_date  date,
  review_state    text NOT NULL DEFAULT 'draft'
                  CHECK (review_state IN ('draft','in_review','approved','retired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, code)
);

ALTER TABLE public.gov_exam_cycles
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_gov_exam_cycles_exam_year
  ON public.gov_exam_cycles (exam_id, year DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_gov_exam_cycles_review
  ON public.gov_exam_cycles (review_state);

-- ── Topics ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_exam_topics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id               uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  stage_id              uuid REFERENCES public.gov_exam_stages(id) ON DELETE SET NULL,
  syllabus_version_id   uuid REFERENCES public.gov_exam_syllabus_versions(id) ON DELETE SET NULL,
  section_code          text,
  topic_code            text NOT NULL,
  name                  text NOT NULL,
  sort_order            int NOT NULL DEFAULT 0
);

ALTER TABLE public.gov_exam_topics
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_exam_topics_unique
  ON public.gov_exam_topics (
    exam_id,
    COALESCE(stage_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(syllabus_version_id, '00000000-0000-0000-0000-000000000000'::uuid),
    topic_code
  );

CREATE INDEX IF NOT EXISTS idx_gov_exam_topics_exam
  ON public.gov_exam_topics (exam_id, sort_order);

-- ── Languages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_exam_languages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  language_code   text NOT NULL,
  review_state    text NOT NULL DEFAULT 'approved'
                  CHECK (review_state IN ('draft','in_review','approved','retired')),
  UNIQUE (exam_id, language_code)
);

ALTER TABLE public.gov_exam_languages
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.gov_exam_languages (exam_id, language_code, review_state)
SELECT DISTINCT e.id, lang, 'approved'
FROM public.gov_exams e
JOIN public.gov_exam_pattern_versions p
  ON p.exam_id = e.id AND p.review_state = 'approved'
CROSS JOIN LATERAL unnest(COALESCE(p.languages, ARRAY['en']::text[])) AS lang
ON CONFLICT (exam_id, language_code) DO NOTHING;

-- ── Pattern rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_exam_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_version_id  uuid NOT NULL REFERENCES public.gov_exam_pattern_versions(id) ON DELETE CASCADE,
  rule_key            text NOT NULL,
  rule_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes               text,
  UNIQUE (pattern_version_id, rule_key)
);

ALTER TABLE public.gov_exam_rules
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_gov_exam_rules_pattern
  ON public.gov_exam_rules (pattern_version_id);

-- ── Question provenance ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_provenance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  source_id       uuid REFERENCES public.gov_official_sources(id) ON DELETE SET NULL,
  source_class    text NOT NULL DEFAULT 'bank',
  license_class   text NOT NULL DEFAULT 'unknown',
  page_ref        text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.question_provenance
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_question_provenance_question
  ON public.question_provenance (question_id);

CREATE INDEX IF NOT EXISTS idx_question_provenance_source
  ON public.question_provenance (source_id)
  WHERE source_id IS NOT NULL;

-- ── Question reviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reviewer_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_reviews_question
  ON public.question_reviews (question_id, created_at DESC);

-- ── Content quality incidents ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_quality_incidents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  paper_id        uuid REFERENCES public.gov_generated_papers(id) ON DELETE SET NULL,
  reporter_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_type   text NOT NULL DEFAULT 'quality',
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','triaged','resolved','rejected','dismissed')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cqi_reporter
  ON public.content_quality_incidents (reporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cqi_status
  ON public.content_quality_incidents (status);

-- ── Source conflicts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.source_conflicts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_a      uuid NOT NULL REFERENCES public.gov_official_sources(id) ON DELETE CASCADE,
  source_b      uuid NOT NULL REFERENCES public.gov_official_sources(id) ON DELETE CASCADE,
  field         text NOT NULL,
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','resolved','dismissed','wont_fix')),
  resolved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.source_conflicts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_source_conflicts_status
  ON public.source_conflicts (status);

COMMENT ON TABLE public.exam_families IS
  'Lookup for gov_exams.family codes (ssc, railways, banking, upsc, state_psc, …).';
COMMENT ON TABLE public.gov_exam_cycles IS
  'Exam notification / year cycles with review_state.';
COMMENT ON TABLE public.gov_exam_topics IS
  'Normalized syllabus topics; optional stage and syllabus_version binding.';
COMMENT ON TABLE public.gov_exam_languages IS
  'Supported exam languages with review gate.';
COMMENT ON TABLE public.gov_exam_rules IS
  'Structured rules attached to a pattern version.';
COMMENT ON TABLE public.question_provenance IS
  'Per-question provenance / license metadata.';
COMMENT ON TABLE public.question_reviews IS
  'Append-only review actions on bank questions.';
COMMENT ON TABLE public.content_quality_incidents IS
  'User/admin-reported quality issues on questions or generated papers.';
COMMENT ON TABLE public.source_conflicts IS
  'Conflict markers between two official sources on a field.';

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.exam_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gov_exam_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_quality_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_conflicts ENABLE ROW LEVEL SECURITY;

-- exam_families
DROP POLICY IF EXISTS exam_families_select ON public.exam_families;
CREATE POLICY exam_families_select ON public.exam_families
  FOR SELECT TO authenticated
  USING (COALESCE(is_active, true) = true);

DROP POLICY IF EXISTS exam_families_admin ON public.exam_families;
CREATE POLICY exam_families_admin ON public.exam_families
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- cycles
DROP POLICY IF EXISTS gov_cycles_select ON public.gov_exam_cycles;
DROP POLICY IF EXISTS gov_exam_cycles_select ON public.gov_exam_cycles;
CREATE POLICY gov_exam_cycles_select ON public.gov_exam_cycles
  FOR SELECT TO authenticated
  USING (
    review_state = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.gov_exams e
      WHERE e.id = exam_id AND e.is_public AND e.review_state = 'approved'
    )
  );

DROP POLICY IF EXISTS gov_cycles_admin ON public.gov_exam_cycles;
DROP POLICY IF EXISTS gov_exam_cycles_admin ON public.gov_exam_cycles;
CREATE POLICY gov_exam_cycles_admin ON public.gov_exam_cycles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- topics
DROP POLICY IF EXISTS gov_topics_select ON public.gov_exam_topics;
DROP POLICY IF EXISTS gov_exam_topics_select ON public.gov_exam_topics;
CREATE POLICY gov_exam_topics_select ON public.gov_exam_topics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gov_exams e
    WHERE e.id = exam_id AND e.is_public AND e.review_state = 'approved'
  ));

DROP POLICY IF EXISTS gov_topics_admin ON public.gov_exam_topics;
DROP POLICY IF EXISTS gov_exam_topics_admin ON public.gov_exam_topics;
CREATE POLICY gov_exam_topics_admin ON public.gov_exam_topics
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- languages
DROP POLICY IF EXISTS gov_langs_select ON public.gov_exam_languages;
DROP POLICY IF EXISTS gov_exam_languages_select ON public.gov_exam_languages;
CREATE POLICY gov_exam_languages_select ON public.gov_exam_languages
  FOR SELECT TO authenticated
  USING (
    review_state = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.gov_exams e
      WHERE e.id = exam_id AND e.is_public AND e.review_state = 'approved'
    )
  );

DROP POLICY IF EXISTS gov_langs_admin ON public.gov_exam_languages;
DROP POLICY IF EXISTS gov_exam_languages_admin ON public.gov_exam_languages;
CREATE POLICY gov_exam_languages_admin ON public.gov_exam_languages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- rules
DROP POLICY IF EXISTS gov_rules_select ON public.gov_exam_rules;
DROP POLICY IF EXISTS gov_exam_rules_select ON public.gov_exam_rules;
CREATE POLICY gov_exam_rules_select ON public.gov_exam_rules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.gov_exam_pattern_versions p
    WHERE p.id = pattern_version_id AND p.review_state = 'approved'
  ));

DROP POLICY IF EXISTS gov_rules_admin ON public.gov_exam_rules;
DROP POLICY IF EXISTS gov_exam_rules_admin ON public.gov_exam_rules;
CREATE POLICY gov_exam_rules_admin ON public.gov_exam_rules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- provenance
DROP POLICY IF EXISTS qprov_select ON public.question_provenance;
DROP POLICY IF EXISTS question_provenance_select ON public.question_provenance;
CREATE POLICY question_provenance_select ON public.question_provenance
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = question_id AND q.is_public = true
  ));

DROP POLICY IF EXISTS qprov_admin ON public.question_provenance;
DROP POLICY IF EXISTS question_provenance_admin ON public.question_provenance;
CREATE POLICY question_provenance_admin ON public.question_provenance
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- reviews (admin only)
DROP POLICY IF EXISTS qrev_admin ON public.question_reviews;
DROP POLICY IF EXISTS question_reviews_admin ON public.question_reviews;
CREATE POLICY question_reviews_admin ON public.question_reviews
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- incidents: own insert/select; admin ALL
DROP POLICY IF EXISTS cqi_select_own ON public.content_quality_incidents;
CREATE POLICY cqi_select_own ON public.content_quality_incidents
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS cqi_insert_own ON public.content_quality_incidents;
CREATE POLICY cqi_insert_own ON public.content_quality_incidents
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS cqi_admin ON public.content_quality_incidents;
CREATE POLICY cqi_admin ON public.content_quality_incidents
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- source conflicts: resolved readable; admin ALL
DROP POLICY IF EXISTS source_conflicts_select ON public.source_conflicts;
DROP POLICY IF EXISTS source_conflicts_select_resolved ON public.source_conflicts;
CREATE POLICY source_conflicts_select_resolved ON public.source_conflicts
  FOR SELECT TO authenticated
  USING (status = 'resolved' OR public.is_admin());

DROP POLICY IF EXISTS source_conflicts_admin ON public.source_conflicts;
CREATE POLICY source_conflicts_admin ON public.source_conflicts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
