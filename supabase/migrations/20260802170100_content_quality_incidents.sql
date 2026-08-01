-- Content quality incidents for user-reported question issues.
-- Prefer this table for report-question edge function.

CREATE TABLE IF NOT EXISTS public.content_quality_incidents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reported_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason        text NOT NULL,
  notes         text,
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','triaging','resolved','dismissed','duplicate')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cqi_question_created
  ON public.content_quality_incidents (question_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cqi_reporter_created
  ON public.content_quality_incidents (reported_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cqi_status
  ON public.content_quality_incidents (status)
  WHERE status IN ('open', 'triaging');

ALTER TABLE public.content_quality_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cqi_insert_own ON public.content_quality_incidents;
CREATE POLICY cqi_insert_own ON public.content_quality_incidents
  FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());

DROP POLICY IF EXISTS cqi_select_own ON public.content_quality_incidents;
CREATE POLICY cqi_select_own ON public.content_quality_incidents
  FOR SELECT TO authenticated
  USING (reported_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS cqi_admin_all ON public.content_quality_incidents;
CREATE POLICY cqi_admin_all ON public.content_quality_incidents
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.content_quality_incidents IS
  'User/admin reports of bank question quality issues for triage.';
