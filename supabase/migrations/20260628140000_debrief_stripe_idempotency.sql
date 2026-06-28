-- Debrief columns, session transcript table, idempotency log, and answer indexing.
-- Closes production gaps for generate-debrief, stripe-webhook, save-answer, and
-- credit-deduction idempotency (_shared/supabase.ts).

--------------------------------------------------------------------------------
-- 1. idempotency_log (stripe-webhook + credit deduction dedupe)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.idempotency_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Used by deductCreditsAtomic (_shared/supabase.ts)
  response   JSONB,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_idempotency_log_expires_at
  ON public.idempotency_log(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.idempotency_log ENABLE ROW LEVEL SECURITY;

-- Service-role edge functions only; no client-facing policies.

--------------------------------------------------------------------------------
-- 2. session_debriefs — columns required by generate-debrief insert
--------------------------------------------------------------------------------

ALTER TABLE public.session_debriefs
  ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE public.session_debriefs
  ADD COLUMN IF NOT EXISTS insight TEXT;

ALTER TABLE public.session_debriefs
  ADD COLUMN IF NOT EXISTS skill_gaps JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.session_debriefs
  ADD COLUMN IF NOT EXISTS action_plan JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.session_debriefs
  ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.session_debriefs
  ADD COLUMN IF NOT EXISTS next_session_goals TEXT[] NOT NULL DEFAULT '{}';

DROP POLICY IF EXISTS session_debriefs_admin ON public.session_debriefs;
CREATE POLICY session_debriefs_admin
  ON public.session_debriefs
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

--------------------------------------------------------------------------------
-- 3. session_answers — question_index for ordering and upsert
--------------------------------------------------------------------------------

ALTER TABLE public.session_answers
  ADD COLUMN IF NOT EXISTS question_index INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_answers_session_user_question
  ON public.session_answers(session_id, user_id, question_index);

DROP POLICY IF EXISTS session_answers_admin ON public.session_answers;
CREATE POLICY session_answers_admin
  ON public.session_answers
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

--------------------------------------------------------------------------------
-- 4. session_transcripts — referenced by functions but never migrated
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.session_transcripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  speaker         TEXT NOT NULL DEFAULT 'user',
  is_final        BOOLEAN NOT NULL DEFAULT TRUE,
  confidence      NUMERIC,
  wpm             NUMERIC,
  filler_count    INTEGER,
  filler_words    TEXT[],
  language        TEXT,
  offset_ms       INTEGER,
  timestamp_ms    INTEGER,
  sequence        INTEGER,
  sentiment       TEXT,
  sentiment_score NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_transcripts_session
  ON public.session_transcripts(session_id);

ALTER TABLE public.session_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transcripts_own ON public.session_transcripts;
DROP POLICY IF EXISTS transcripts_admin ON public.session_transcripts;

CREATE POLICY transcripts_own
  ON public.session_transcripts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY transcripts_admin
  ON public.session_transcripts
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

COMMENT ON COLUMN public.session_transcripts.content IS
  'PII: Speech transcript. Subject to retention policy. Purge after 30 days or on deletion.';
