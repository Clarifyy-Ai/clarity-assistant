-- Wave 2 P1-I: tighten coach insert integrity + drop redundant session policies.
-- has_role clamp already landed in 20260824190000 (auth.uid() for JWT callers).
-- document_processing_jobs owner SELECT-only RLS remains correct (mutations via service role).

-- Coach conversations: require owned session on insert/update.
DROP POLICY IF EXISTS coach_conversations_own_insert ON public.coach_conversations;
CREATE POLICY coach_conversations_own_insert
  ON public.coach_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coach_conversations_own_update ON public.coach_conversations;
CREATE POLICY coach_conversations_own_update
  ON public.coach_conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

-- Coach messages: require owned conversation + owned session.
DROP POLICY IF EXISTS coach_messages_own_insert ON public.coach_messages;
CREATE POLICY coach_messages_own_insert
  ON public.coach_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.coach_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

-- Sessions: keep sessions_own + sessions_admin; drop legacy named duplicates.
DROP POLICY IF EXISTS "Users can read own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
