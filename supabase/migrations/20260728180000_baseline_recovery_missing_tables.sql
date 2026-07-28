-- P4-5: Baseline recovery stubs for tables present in generated types / live DB
-- but missing CREATE TABLE from the tracked migration history.
--
-- IMPORTANT: Full historical policy-order recovery still requires a staging dump.
-- This migration makes tables exist for new environments going forward so later
-- policies and application code have something to attach to.
--
-- Deferred (exact DDL needs staging dump): answers, debriefs, transcripts, rooms,
-- companies, model_pricing — see CHANGELOG P4-5.

BEGIN;

-- Enums (idempotent)
DO $$ BEGIN
  CREATE TYPE public.interview_status AS ENUM (
    'scheduled', 'completed', 'cancelled', 'rescheduled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_model AS ENUM (
    'gpt-4o',
    'gpt-4o-mini',
    'claude-3-5-sonnet',
    'claude-3-haiku',
    'gemini-1-5-pro',
    'gemini-1-5-flash',
    'gemini-2.0-flash'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── achievements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,
  category TEXT,
  condition_type TEXT,
  condition_value INTEGER,
  credit_reward INTEGER NOT NULL DEFAULT 0,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS achievements_read_active ON public.achievements;
CREATE POLICY achievements_read_active ON public.achievements
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS achievements_admin_all ON public.achievements;
CREATE POLICY achievements_admin_all ON public.achievements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── user_achievements ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ua_select ON public.user_achievements;
CREATE POLICY ua_select ON public.user_achievements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ua_admin ON public.user_achievements;
CREATE POLICY ua_admin ON public.user_achievements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- M8: no authenticated INSERT — drop legacy insert policies if present
DROP POLICY IF EXISTS "ua_insert" ON public.user_achievements;
DROP POLICY IF EXISTS ua_insert ON public.user_achievements;
REVOKE INSERT ON public.user_achievements FROM authenticated, anon;
GRANT ALL ON public.user_achievements TO service_role;

-- ── interviews (legacy; company_id left without FK — companies deferred) ───
CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status public.interview_status NOT NULL DEFAULT 'scheduled',
  company_id UUID,
  document_id UUID,
  calendar_event_id TEXT,
  interview_type TEXT,
  interviewer TEXT,
  location TEXT,
  meeting_url TEXT,
  notes TEXT,
  feedback TEXT,
  outcome TEXT,
  rating INTEGER,
  round INTEGER,
  duration_min INTEGER,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interviews_own ON public.interviews;
CREATE POLICY interviews_own ON public.interviews
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── admin_audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_log_admin_read ON public.admin_audit_log;
CREATE POLICY admin_audit_log_admin_read ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS admin_audit_log_admin_insert ON public.admin_audit_log;
CREATE POLICY admin_audit_log_admin_insert ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = admin_id);

-- ── model_cost_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.model_cost_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID,
  model public.ai_model NOT NULL,
  feature TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.model_cost_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_cost_select ON public.model_cost_logs;
CREATE POLICY model_cost_select ON public.model_cost_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cost_admin ON public.model_cost_logs;
CREATE POLICY cost_admin ON public.model_cost_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- M8: no authenticated INSERT — drop legacy insert policies if present
DROP POLICY IF EXISTS "model_cost_insert" ON public.model_cost_logs;
DROP POLICY IF EXISTS model_cost_insert ON public.model_cost_logs;
REVOKE INSERT ON public.model_cost_logs FROM authenticated, anon;
GRANT ALL ON public.model_cost_logs TO service_role;

-- ── session_ai_interactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  prompt TEXT,
  response TEXT,
  model public.ai_model,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  credits_cost INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.session_ai_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_own ON public.session_ai_interactions;
CREATE POLICY ai_own ON public.session_ai_interactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.interviews IS
  'P4-5 baseline recovery stub — legacy interview table; prefer scheduled_interviews.';
COMMENT ON TABLE public.achievements IS
  'P4-5 baseline recovery stub — achievements catalog.';
COMMENT ON TABLE public.user_achievements IS
  'P4-5 baseline recovery stub — earned achievements; INSERT revoked from authenticated (M8).';
COMMENT ON TABLE public.admin_audit_log IS
  'P4-5 baseline recovery stub — admin action audit trail.';
COMMENT ON TABLE public.model_cost_logs IS
  'P4-5 baseline recovery stub — per-call cost log; INSERT revoked from authenticated (M8).';
COMMENT ON TABLE public.session_ai_interactions IS
  'P4-5 baseline recovery stub — per-session AI interaction log.';

COMMIT;
