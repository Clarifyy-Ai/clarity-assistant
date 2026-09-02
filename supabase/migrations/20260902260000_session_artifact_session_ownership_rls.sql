-- Session artifacts must reference an owned session (parity with coach_conversations RLS).
-- Prevents authenticated users from attaching answers/transcripts to another user's session_id.

BEGIN;

-- ── session_answers ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own session answers" ON public.session_answers;
DROP POLICY IF EXISTS session_answers_admin ON public.session_answers;

CREATE POLICY session_answers_own_select
  ON public.session_answers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY session_answers_own_insert
  ON public.session_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND session_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY session_answers_own_update
  ON public.session_answers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND session_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY session_answers_own_delete
  ON public.session_answers
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY session_answers_admin
  ON public.session_answers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── session_transcripts ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS transcripts_own ON public.session_transcripts;
DROP POLICY IF EXISTS transcripts_admin ON public.session_transcripts;

CREATE POLICY session_transcripts_own_select
  ON public.session_transcripts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY session_transcripts_own_insert
  ON public.session_transcripts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY session_transcripts_own_update
  ON public.session_transcripts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY session_transcripts_own_delete
  ON public.session_transcripts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY session_transcripts_admin
  ON public.session_transcripts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
