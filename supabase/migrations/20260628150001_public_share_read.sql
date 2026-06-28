-- Public read-only access for shared debriefs and scorecards.

DROP POLICY IF EXISTS session_debriefs_public_share ON public.session_debriefs;
CREATE POLICY session_debriefs_public_share
  ON public.session_debriefs
  FOR SELECT TO anon, authenticated
  USING (
    (detailed_report->>'is_shared')::boolean IS TRUE
    AND (detailed_report->>'share_token') IS NOT NULL
  );

DROP POLICY IF EXISTS scorecards_public_share ON public.scorecards;
CREATE POLICY scorecards_public_share
  ON public.scorecards
  FOR SELECT TO anon, authenticated
  USING (is_shared = true AND share_token IS NOT NULL);
