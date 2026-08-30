-- Adaptive preparation: topic mastery, exam readiness, preparation plans.
-- User-owned rows only (RLS).

BEGIN;

-- ── topic_mastery ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.topic_mastery (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  topic           text NOT NULL,
  mastery_score   numeric NOT NULL DEFAULT 0
                  CHECK (mastery_score >= 0 AND mastery_score <= 1),
  state           text NOT NULL DEFAULT 'not_assessed'
                  CHECK (state IN (
                    'not_assessed',
                    'foundation_needed',
                    'developing',
                    'practicing',
                    'strong',
                    'exam_ready'
                  )),
  evidence_count  integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_topic_mastery_user_exam
  ON public.topic_mastery (user_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_topic_mastery_user_state
  ON public.topic_mastery (user_id, state);

-- ── exam_readiness ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_readiness (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  stage_id        uuid NOT NULL REFERENCES public.gov_exam_stages(id) ON DELETE CASCADE,
  score           numeric NOT NULL DEFAULT 0
                  CHECK (score >= 0 AND score <= 100),
  breakdown       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_readiness_user_exam
  ON public.exam_readiness (user_id, exam_id);

-- ── preparation_plans ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.preparation_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL REFERENCES public.gov_exams(id) ON DELETE CASCADE,
  plan_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_preparation_plans_user
  ON public.preparation_plans (user_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_topic_mastery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_topic_mastery_updated_at ON public.topic_mastery;
CREATE TRIGGER trg_topic_mastery_updated_at
  BEFORE UPDATE ON public.topic_mastery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_topic_mastery();

CREATE OR REPLACE FUNCTION public.set_updated_at_exam_readiness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_readiness_updated_at ON public.exam_readiness;
CREATE TRIGGER trg_exam_readiness_updated_at
  BEFORE UPDATE ON public.exam_readiness
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_exam_readiness();

CREATE OR REPLACE FUNCTION public.set_updated_at_preparation_plans()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preparation_plans_updated_at ON public.preparation_plans;
CREATE TRIGGER trg_preparation_plans_updated_at
  BEFORE UPDATE ON public.preparation_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_preparation_plans();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.topic_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topic_mastery_own ON public.topic_mastery;
CREATE POLICY topic_mastery_own ON public.topic_mastery
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS exam_readiness_own ON public.exam_readiness;
CREATE POLICY exam_readiness_own ON public.exam_readiness
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS preparation_plans_own ON public.preparation_plans;
CREATE POLICY preparation_plans_own ON public.preparation_plans
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_mastery TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_readiness TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preparation_plans TO authenticated;

GRANT ALL ON public.topic_mastery TO service_role;
GRANT ALL ON public.exam_readiness TO service_role;
GRANT ALL ON public.preparation_plans TO service_role;

COMMIT;
