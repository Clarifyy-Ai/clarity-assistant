-- Practice Coach launch context (Answer Bank → setup). Owner-only RLS.
-- sessions.source_type / practice_context_id so History can label Answer Bank practice.

CREATE TABLE IF NOT EXISTS public.practice_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'answer_bank',
  source_id uuid,
  source_version text,
  question_text text NOT NULL DEFAULT '',
  competency text,
  role text,
  company text,
  resume_id uuid,
  jd_id uuid,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'consumed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_practice_contexts_user_status
  ON public.practice_contexts (user_id, status, created_at DESC);

ALTER TABLE public.practice_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_contexts_owner_all ON public.practice_contexts;
CREATE POLICY practice_contexts_owner_all
  ON public.practice_contexts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.practice_contexts TO authenticated;
GRANT ALL ON TABLE public.practice_contexts TO service_role;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS practice_context_id uuid,
  ADD COLUMN IF NOT EXISTS source_type text;

CREATE INDEX IF NOT EXISTS idx_sessions_user_completed
  ON public.sessions (user_id, type, ended_at DESC);
