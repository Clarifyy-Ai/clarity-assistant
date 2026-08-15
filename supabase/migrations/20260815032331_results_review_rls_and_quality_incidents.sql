-- Results review: let users read questions on their own mock tests, and align
-- content_quality_incidents with report-question (reported_by / reason / metadata).
-- The earlier CREATE TABLE IF NOT EXISTS in 20260802170100 was a no-op because
-- 20260802170000 already created a thinner schema (reporter_id / incident_type).

-- ── Questions visible on the taker's own papers ────────────────────────────
-- Dedupe unpublished duplicate public stems (is_public = false) while leaving
-- those IDs on mock_tests.question_ids. Without this, results/session .in(id)
-- silently returns only the still-public rows.

DROP POLICY IF EXISTS questions_select_own_attempts ON public.questions;
CREATE POLICY questions_select_own_attempts ON public.questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mock_tests mt
      WHERE mt.user_id = auth.uid()
        AND mt.question_ids @> ARRAY[questions.id]
    )
    OR EXISTS (
      SELECT 1
      FROM public.test_responses tr
      WHERE tr.user_id = auth.uid()
        AND tr.question_id = questions.id
    )
  );

CREATE INDEX IF NOT EXISTS mock_tests_question_ids_gin
  ON public.mock_tests USING GIN (question_ids);

CREATE INDEX IF NOT EXISTS test_responses_user_question_idx
  ON public.test_responses (user_id, question_id);

-- ── Align quality-incident columns with report-question ────────────────────
ALTER TABLE public.content_quality_incidents
  ADD COLUMN IF NOT EXISTS reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.content_quality_incidents
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.content_quality_incidents
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.content_quality_incidents
SET reported_by = reporter_id
WHERE reported_by IS NULL AND reporter_id IS NOT NULL;

UPDATE public.content_quality_incidents
SET reason = incident_type
WHERE reason IS NULL AND incident_type IS NOT NULL AND btrim(incident_type) <> '';

CREATE INDEX IF NOT EXISTS idx_cqi_reporter_created
  ON public.content_quality_incidents (reported_by, created_at DESC);

ALTER TABLE public.content_quality_incidents
  DROP CONSTRAINT IF EXISTS content_quality_incidents_status_check;

ALTER TABLE public.content_quality_incidents
  ADD CONSTRAINT content_quality_incidents_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'open'::text,
        'triaged'::text,
        'triaging'::text,
        'resolved'::text,
        'rejected'::text,
        'dismissed'::text,
        'duplicate'::text
      ]
    )
  );

DROP POLICY IF EXISTS cqi_insert_own ON public.content_quality_incidents;
CREATE POLICY cqi_insert_own ON public.content_quality_incidents
  FOR INSERT TO authenticated
  WITH CHECK (COALESCE(reported_by, reporter_id) = auth.uid());

DROP POLICY IF EXISTS cqi_select_own ON public.content_quality_incidents;
CREATE POLICY cqi_select_own ON public.content_quality_incidents
  FOR SELECT TO authenticated
  USING (COALESCE(reported_by, reporter_id) = auth.uid() OR public.is_admin());
