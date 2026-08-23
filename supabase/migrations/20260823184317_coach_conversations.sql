-- Coach chat conversations + messages (Practice Coach / Mock Overlay Chat).
-- Additive only. One conversation per session; owner RLS for client reads.

CREATE TABLE IF NOT EXISTS public.coach_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coach_conversations_session_unique UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_session
  ON public.coach_conversations (user_id, session_id);

CREATE TABLE IF NOT EXISTS public.coach_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  session_id       UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'coach')),
  content          TEXT NOT NULL DEFAULT '',
  operation_id     TEXT,
  source           TEXT CHECK (source IS NULL OR source IN ('ai', 'python', 'deterministic')),
  status           TEXT NOT NULL DEFAULT 'complete'
                     CHECK (status IN ('pending', 'complete', 'failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_messages_conversation_created
  ON public.coach_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_coach_messages_user_session
  ON public.coach_messages (user_id, session_id);

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_conversations_own_select ON public.coach_conversations;
DROP POLICY IF EXISTS coach_conversations_own_insert ON public.coach_conversations;
DROP POLICY IF EXISTS coach_conversations_own_update ON public.coach_conversations;
DROP POLICY IF EXISTS coach_messages_own_select ON public.coach_messages;
DROP POLICY IF EXISTS coach_messages_own_insert ON public.coach_messages;

CREATE POLICY coach_conversations_own_select
  ON public.coach_conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY coach_conversations_own_insert
  ON public.coach_conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY coach_conversations_own_update
  ON public.coach_conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY coach_messages_own_select
  ON public.coach_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY coach_messages_own_insert
  ON public.coach_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.coach_conversations IS
  'AI coach chat thread bound 1:1 to a practice/mock session.';
COMMENT ON TABLE public.coach_messages IS
  'Persisted coach chat turns (user/coach). System prompts are never stored.';
