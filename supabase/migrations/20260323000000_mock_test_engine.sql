-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: mock_test_engine
-- Creates all tables for the Mock Test Engine module.
-- Safe to run multiple times (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── questions ───────────────────────────────────────────────────────────────
-- Master question bank. Public official questions + user-uploaded questions.

CREATE TABLE IF NOT EXISTS public.questions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text    TEXT        NOT NULL,
  question_html    TEXT,
  question_type    TEXT        NOT NULL DEFAULT 'MCQ'
                               CHECK (question_type IN ('MCQ','TRUE_FALSE','SHORT_ANSWER','NUMERICAL','CODING')),
  options          JSONB,                         -- [{label:'A', text:'...'}, ...]
  correct_answer   TEXT        NOT NULL,
  explanation      TEXT,
  explanation_html TEXT,
  subject          TEXT        NOT NULL,
  topic            TEXT        NOT NULL,
  subtopic         TEXT,
  difficulty       TEXT        CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  exam_type        TEXT,                          -- JEE_MAIN, NEET, UPSC, SSC_CGL etc.
  source           TEXT        CHECK (source IN ('OFFICIAL_PYP','AI_GENERATED','USER_UPLOAD')),
  source_year      INTEGER,
  source_paper     TEXT,                          -- e.g. "JEE Main 2024 Jan Shift 1"
  marks_positive   DECIMAL(4,2) DEFAULT 4,
  marks_negative   DECIMAL(4,2) DEFAULT 1,
  has_image        BOOLEAN     DEFAULT false,
  image_url        TEXT,
  latex_present    BOOLEAN     DEFAULT false,
  uploaded_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_verified      BOOLEAN     DEFAULT false,
  is_public        BOOLEAN     DEFAULT true,
  upvotes          INTEGER     DEFAULT 0,
  downvotes        INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questions_subject_idx    ON public.questions (subject);
CREATE INDEX IF NOT EXISTS questions_exam_type_idx  ON public.questions (exam_type);
CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON public.questions (difficulty);
CREATE INDEX IF NOT EXISTS questions_uploaded_by_idx ON public.questions (uploaded_by);
CREATE INDEX IF NOT EXISTS questions_source_idx     ON public.questions (source);
CREATE INDEX IF NOT EXISTS questions_options_gin    ON public.questions USING GIN (options);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "questions_select" ON public.questions;
CREATE POLICY "questions_select" ON public.questions FOR SELECT
  USING (is_public = true OR uploaded_by = auth.uid());

DROP POLICY IF EXISTS "questions_insert" ON public.questions;
CREATE POLICY "questions_insert" ON public.questions FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "questions_update" ON public.questions;
CREATE POLICY "questions_update" ON public.questions FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "questions_delete" ON public.questions;
CREATE POLICY "questions_delete" ON public.questions FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());


-- ─── exam_papers ─────────────────────────────────────────────────────────────
-- Metadata for official exam papers (seeds the browse-by-paper UI).

CREATE TABLE IF NOT EXISTS public.exam_papers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_name        TEXT        NOT NULL,          -- "JEE Main"
  exam_type        TEXT        NOT NULL,          -- "JEE_MAIN"
  year             INTEGER     NOT NULL,
  session          TEXT,                          -- "January", "April"
  shift            TEXT,                          -- "Shift 1", "Shift 2"
  paper_number     TEXT,                          -- "Paper 1", "Paper 2"
  total_questions  INTEGER,
  total_marks      INTEGER,
  duration_minutes INTEGER,
  difficulty_level TEXT,
  pdf_url          TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_papers_type_year_idx ON public.exam_papers (exam_type, year);

ALTER TABLE public.exam_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exam_papers_select" ON public.exam_papers;
CREATE POLICY "exam_papers_select" ON public.exam_papers FOR SELECT
  USING (true);


-- ─── mock_tests ──────────────────────────────────────────────────────────────
-- Test sessions created by users.

CREATE TABLE IF NOT EXISTS public.mock_tests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_name           TEXT        NOT NULL,
  config              JSONB       NOT NULL DEFAULT '{}',   -- full TestConfig object
  question_ids        UUID[]      NOT NULL DEFAULT '{}',   -- ordered selected question IDs
  status              TEXT        NOT NULL DEFAULT 'DRAFT'
                                  CHECK (status IN ('DRAFT','IN_PROGRESS','COMPLETED','ABANDONED')),
  started_at          TIMESTAMPTZ,
  submitted_at        TIMESTAMPTZ,
  time_limit_minutes  INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mock_tests_user_id_idx  ON public.mock_tests (user_id);
CREATE INDEX IF NOT EXISTS mock_tests_status_idx   ON public.mock_tests (status);
CREATE INDEX IF NOT EXISTS mock_tests_created_idx  ON public.mock_tests (created_at DESC);

ALTER TABLE public.mock_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mock_tests_all" ON public.mock_tests;
CREATE POLICY "mock_tests_all" ON public.mock_tests
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── test_responses ──────────────────────────────────────────────────────────
-- User answers collected during a test session. Auto-saved every 30 seconds.

CREATE TABLE IF NOT EXISTS public.test_responses (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID        NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id         UUID        NOT NULL REFERENCES public.questions(id),
  user_answer         TEXT,
  is_correct          BOOLEAN,
  is_attempted        BOOLEAN     DEFAULT false,
  is_marked_review    BOOLEAN     DEFAULT false,
  time_spent_seconds  INTEGER,
  answered_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (test_id, question_id)
);

CREATE INDEX IF NOT EXISTS test_responses_test_id_idx    ON public.test_responses (test_id);
CREATE INDEX IF NOT EXISTS test_responses_user_id_idx    ON public.test_responses (user_id);
CREATE INDEX IF NOT EXISTS test_responses_question_id_idx ON public.test_responses (question_id);

ALTER TABLE public.test_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "test_responses_all" ON public.test_responses;
CREATE POLICY "test_responses_all" ON public.test_responses
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── test_analyses ───────────────────────────────────────────────────────────
-- Calculated results + AI-generated analysis stored after test submission.

CREATE TABLE IF NOT EXISTS public.test_analyses (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id                UUID        NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_score            DECIMAL(8,2),
  max_score              DECIMAL(8,2),
  accuracy               DECIMAL(5,2),
  attempt_percentage     DECIMAL(5,2),
  subject_breakdown      JSONB,      -- {Physics: {correct:18, wrong:7, accuracy:72, attempted:25}}
  topic_breakdown        JSONB,      -- {topic: {correct, wrong, time_avg, accuracy}}
  weak_topics            TEXT[]      DEFAULT '{}',
  strong_topics          TEXT[]      DEFAULT '{}',
  time_analysis          JSONB,      -- {avg_seconds, time_traps: [{q_id, time}], guessed: [q_id]}
  ai_analysis_text       TEXT,       -- Claude-generated analysis report
  predicted_percentile   DECIMAL(5,2),
  improvement_vs_last    DECIMAL(5,2),
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (test_id)
);

CREATE INDEX IF NOT EXISTS test_analyses_user_id_idx   ON public.test_analyses (user_id);
CREATE INDEX IF NOT EXISTS test_analyses_test_id_idx   ON public.test_analyses (test_id);
CREATE INDEX IF NOT EXISTS test_analyses_created_idx   ON public.test_analyses (created_at DESC);

ALTER TABLE public.test_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "test_analyses_all" ON public.test_analyses;
CREATE POLICY "test_analyses_all" ON public.test_analyses
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── revision_list ───────────────────────────────────────────────────────────
-- Spaced repetition queue — questions added from test results.

CREATE TABLE IF NOT EXISTS public.revision_list (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id         UUID        NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  added_from_test_id  UUID        REFERENCES public.mock_tests(id) ON DELETE SET NULL,
  next_review_date    DATE        NOT NULL DEFAULT CURRENT_DATE + 1,
  review_count        INTEGER     NOT NULL DEFAULT 0,
  interval_days       INTEGER     NOT NULL DEFAULT 1,    -- current spaced repetition interval
  is_mastered         BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Each user can have at most one active revision entry per question
CREATE UNIQUE INDEX IF NOT EXISTS revision_list_user_question_active_idx
  ON public.revision_list (user_id, question_id)
  WHERE is_mastered = false;

CREATE INDEX IF NOT EXISTS revision_list_user_id_idx       ON public.revision_list (user_id);
CREATE INDEX IF NOT EXISTS revision_list_next_review_idx   ON public.revision_list (user_id, next_review_date)
  WHERE is_mastered = false;

ALTER TABLE public.revision_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revision_list_all" ON public.revision_list;
CREATE POLICY "revision_list_all" ON public.revision_list
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── user_topic_performance ──────────────────────────────────────────────────
-- Cumulative topic accuracy aggregated across all tests for adaptive selection.

CREATE TABLE IF NOT EXISTS public.user_topic_performance (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic            TEXT        NOT NULL,
  subject          TEXT        NOT NULL,
  exam_type        TEXT,
  total_attempted  INTEGER     NOT NULL DEFAULT 0,
  total_correct    INTEGER     NOT NULL DEFAULT 0,
  accuracy         DECIMAL(5,2) DEFAULT 0,
  avg_time_seconds DECIMAL(6,2),
  last_practiced   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, topic, exam_type)
);

CREATE INDEX IF NOT EXISTS utp_user_id_idx    ON public.user_topic_performance (user_id);
CREATE INDEX IF NOT EXISTS utp_accuracy_idx   ON public.user_topic_performance (user_id, accuracy);
CREATE INDEX IF NOT EXISTS utp_exam_type_idx  ON public.user_topic_performance (exam_type);

ALTER TABLE public.user_topic_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "utp_all" ON public.user_topic_performance;
CREATE POLICY "utp_all" ON public.user_topic_performance
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── update_topic_performance RPC ────────────────────────────────────────────
-- Atomically upserts topic stats after test submission.
-- Called by the submit-test edge function.

CREATE OR REPLACE FUNCTION public.update_topic_performance(
  p_user_id          UUID,
  p_topic            TEXT,
  p_subject          TEXT,
  p_exam_type        TEXT,
  p_attempted_delta  INTEGER,
  p_correct_delta    INTEGER,
  p_avg_time_seconds DECIMAL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_attempted INTEGER;
  v_total_correct   INTEGER;
  v_accuracy        DECIMAL(5,2);
BEGIN
  INSERT INTO public.user_topic_performance
    (user_id, topic, subject, exam_type, total_attempted, total_correct,
     accuracy, avg_time_seconds, last_practiced, updated_at)
  VALUES
    (p_user_id, p_topic, p_subject, p_exam_type, p_attempted_delta, p_correct_delta,
     CASE WHEN p_attempted_delta > 0
          THEN ROUND((p_correct_delta::DECIMAL / p_attempted_delta) * 100, 2)
          ELSE 0 END,
     p_avg_time_seconds, now(), now())
  ON CONFLICT (user_id, topic, exam_type) DO UPDATE SET
    total_attempted  = user_topic_performance.total_attempted + EXCLUDED.total_attempted,
    total_correct    = user_topic_performance.total_correct   + EXCLUDED.total_correct,
    accuracy         = CASE
                         WHEN (user_topic_performance.total_attempted + EXCLUDED.total_attempted) > 0
                         THEN ROUND(
                           ((user_topic_performance.total_correct + EXCLUDED.total_correct)::DECIMAL /
                            (user_topic_performance.total_attempted + EXCLUDED.total_attempted)) * 100, 2)
                         ELSE 0
                       END,
    avg_time_seconds = CASE
                         WHEN user_topic_performance.avg_time_seconds IS NULL THEN EXCLUDED.avg_time_seconds
                         ELSE ROUND((user_topic_performance.avg_time_seconds + EXCLUDED.avg_time_seconds) / 2, 2)
                       END,
    last_practiced   = now(),
    updated_at       = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_topic_performance TO service_role;
GRANT EXECUTE ON FUNCTION public.update_topic_performance TO authenticated;


-- ─── Triggers: updated_at auto-maintenance ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER questions_updated_at
    BEFORE UPDATE ON public.questions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER exam_papers_updated_at
    BEFORE UPDATE ON public.exam_papers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER mock_tests_updated_at
    BEFORE UPDATE ON public.mock_tests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER test_responses_updated_at
    BEFORE UPDATE ON public.test_responses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER test_analyses_updated_at
    BEFORE UPDATE ON public.test_analyses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER revision_list_updated_at
    BEFORE UPDATE ON public.revision_list
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER utp_updated_at
    BEFORE UPDATE ON public.user_topic_performance
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
