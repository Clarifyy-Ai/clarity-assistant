-- Dual-engine certification: lifecycle columns, practice plans, honest ranking,
-- playable question view, exam onboarding fields, current-affairs ingest (empty).

-- ── Interview session lifecycle ────────────────────────────────────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS lifecycle_status text;

UPDATE public.sessions
SET lifecycle_status = CASE status::text
  WHEN 'pending' THEN 'CREATED'
  WHEN 'active' THEN 'IN_PROGRESS'
  WHEN 'paused' THEN 'PAUSED'
  WHEN 'completed' THEN 'COMPLETED'
  WHEN 'abandoned' THEN 'CANCELLED'
  ELSE 'CREATED'
END
WHERE lifecycle_status IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN lifecycle_status SET DEFAULT 'CREATED';

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_lifecycle_status_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_lifecycle_status_check CHECK (
    lifecycle_status = ANY (ARRAY[
      'CREATED',
      'DEVICE_CHECK',
      'READY',
      'IN_PROGRESS',
      'PAUSED',
      'COMPLETED',
      'PROCESSING',
      'ANALYZED',
      'CANCELLED',
      'INTERRUPTED',
      'RECOVERABLE_ERROR',
      'FAILED'
    ]::text[])
  );

-- ── Profile coaching fields ────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS industry text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS improvement_goals text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interview_difficulty text;

-- ── Interview practice plans ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_practice_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Interview practice plan',
  source text NOT NULL DEFAULT 'rule_based',
  plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_practice_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.interview_practice_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  activity_type text NOT NULL,
  competency text,
  reason text,
  recommended_route text,
  completed boolean NOT NULL DEFAULT false,
  due_offset_days integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_practice_plans_user_idx
  ON public.interview_practice_plans (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS interview_practice_plan_items_user_idx
  ON public.interview_practice_plan_items (user_id, completed);

ALTER TABLE public.interview_practice_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_practice_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ipp_select_own ON public.interview_practice_plans;
CREATE POLICY ipp_select_own ON public.interview_practice_plans
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS ipp_insert_own ON public.interview_practice_plans;
CREATE POLICY ipp_insert_own ON public.interview_practice_plans
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS ipp_update_own ON public.interview_practice_plans;
CREATE POLICY ipp_update_own ON public.interview_practice_plans
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS ipp_delete_own ON public.interview_practice_plans;
CREATE POLICY ipp_delete_own ON public.interview_practice_plans
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS ippi_select_own ON public.interview_practice_plan_items;
CREATE POLICY ippi_select_own ON public.interview_practice_plan_items
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS ippi_insert_own ON public.interview_practice_plan_items;
CREATE POLICY ippi_insert_own ON public.interview_practice_plan_items
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS ippi_update_own ON public.interview_practice_plan_items;
CREATE POLICY ippi_update_own ON public.interview_practice_plan_items
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS ippi_delete_own ON public.interview_practice_plan_items;
CREATE POLICY ippi_delete_own ON public.interview_practice_plan_items
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Exam player phase + evaluation version + rank honesty ──────────────────
ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS attempt_phase text;

UPDATE public.mock_tests
SET attempt_phase = CASE status
  WHEN 'DRAFT' THEN 'NOT_STARTED'
  WHEN 'IN_PROGRESS' THEN 'ACTIVE'
  WHEN 'COMPLETED' THEN 'RESULT_AVAILABLE'
  WHEN 'ABANDONED' THEN 'INVALIDATED'
  ELSE 'NOT_STARTED'
END
WHERE attempt_phase IS NULL;

ALTER TABLE public.mock_tests
  ALTER COLUMN attempt_phase SET DEFAULT 'NOT_STARTED';

ALTER TABLE public.mock_tests
  DROP CONSTRAINT IF EXISTS mock_tests_attempt_phase_check;
ALTER TABLE public.mock_tests
  ADD CONSTRAINT mock_tests_attempt_phase_check CHECK (
    attempt_phase = ANY (ARRAY[
      'NOT_STARTED',
      'INSTRUCTIONS',
      'ACTIVE',
      'PAUSED',
      'SUBMITTING',
      'SUBMITTED',
      'EVALUATING',
      'RESULT_AVAILABLE',
      'CONNECTION_LOST',
      'RESTORING',
      'AUTO_SUBMITTED',
      'INVALIDATED'
    ]::text[])
  );

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS evaluation_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS rank_status text NOT NULL DEFAULT 'unavailable';

ALTER TABLE public.mock_tests
  DROP CONSTRAINT IF EXISTS mock_tests_rank_status_check;
ALTER TABLE public.mock_tests
  ADD CONSTRAINT mock_tests_rank_status_check CHECK (
    rank_status = ANY (ARRAY['unavailable', 'provisional', 'final']::text[])
  );

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS cohort_id uuid;

-- ── Honest cohort ranking (empty until min size) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_attempt_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.gov_exams(id) ON DELETE SET NULL,
  paper_fingerprint text NOT NULL,
  min_size integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paper_fingerprint)
);

CREATE TABLE IF NOT EXISTS public.exam_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.exam_attempt_cohorts(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  rank integer,
  percentile numeric,
  status text NOT NULL DEFAULT 'unavailable',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, test_id)
);

ALTER TABLE public.exam_attempt_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_ranks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eac_select_own ON public.exam_attempt_cohorts;
CREATE POLICY eac_select_own ON public.exam_attempt_cohorts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS er_select_own ON public.exam_ranks;
CREATE POLICY er_select_own ON public.exam_ranks
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- ── Exam onboarding preferences ────────────────────────────────────────────
ALTER TABLE public.user_gov_exam_preferences
  ADD COLUMN IF NOT EXISTS target_year integer;
ALTER TABLE public.user_gov_exam_preferences
  ADD COLUMN IF NOT EXISTS attempt_date date;
ALTER TABLE public.user_gov_exam_preferences
  ADD COLUMN IF NOT EXISTS preparation_level text;
ALTER TABLE public.user_gov_exam_preferences
  ADD COLUMN IF NOT EXISTS weekly_study_hours numeric;

-- ── Playable questions (no answer keys) ────────────────────────────────────
DROP VIEW IF EXISTS public.questions_playable;
CREATE VIEW public.questions_playable
WITH (security_invoker = true) AS
SELECT
  id,
  question_text,
  question_html,
  question_type,
  options,
  subject,
  topic,
  subtopic,
  difficulty,
  exam_type,
  marks_positive,
  marks_negative,
  has_image,
  image_url,
  latex_present,
  is_verified,
  is_public,
  uploaded_by,
  created_at
FROM public.questions;

GRANT SELECT ON public.questions_playable TO authenticated;

-- ── Current affairs (verified sources only; no seed events) ────────────────
CREATE TABLE IF NOT EXISTS public.current_affairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_on date NOT NULL,
  category text NOT NULL,
  source_url text NOT NULL,
  source_name text NOT NULL,
  summary text NOT NULL,
  exam_relevance text,
  language text NOT NULL DEFAULT 'en',
  last_verified_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.current_affairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ca_select_verified ON public.current_affairs;
CREATE POLICY ca_select_verified ON public.current_affairs
  FOR SELECT TO authenticated USING (last_verified_at IS NOT NULL);
DROP POLICY IF EXISTS ca_admin_all ON public.current_affairs;
CREATE POLICY ca_admin_all ON public.current_affairs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Author vs reviewer separation on question_reviews ──────────────────────
ALTER TABLE public.question_reviews
  ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.question_reviews
  ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'question_reviews_author_reviewer_distinct'
  ) THEN
    ALTER TABLE public.question_reviews
      ADD CONSTRAINT question_reviews_author_reviewer_distinct
      CHECK (author_id IS NULL OR reviewer_id IS NULL OR author_id <> reviewer_id);
  END IF;
END $$;
