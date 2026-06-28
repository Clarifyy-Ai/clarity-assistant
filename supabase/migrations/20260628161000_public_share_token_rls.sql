-- Harden public share access: remove broad anon SELECT on all shared rows.
-- Shared reads must go through token-scoped SECURITY DEFINER RPCs.

DROP POLICY IF EXISTS session_debriefs_public_share ON public.session_debriefs;
DROP POLICY IF EXISTS scorecards_public_share ON public.scorecards;

-- ---------------------------------------------------------------------------
-- get_shared_debrief(p_token) — exact token match only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shared_debrief(p_token TEXT)
RETURNS SETOF public.session_debriefs
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := NULLIF(trim(p_token), '');

  IF v_token IS NULL
     OR length(v_token) < 16
     OR length(v_token) > 128
     OR v_token !~ '^[A-Za-z0-9_-]+$'
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sd.*
  FROM public.session_debriefs sd
  WHERE (sd.detailed_report->>'is_shared')::boolean IS TRUE
    AND sd.detailed_report->>'share_token' = v_token
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_debrief(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_debrief(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_shared_debrief(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_shared_scorecard(p_token) — exact token match only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shared_scorecard(p_token TEXT)
RETURNS SETOF public.scorecards
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := NULLIF(trim(p_token), '');

  IF v_token IS NULL
     OR length(v_token) < 16
     OR length(v_token) > 128
     OR v_token !~ '^[A-Za-z0-9_-]+$'
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sc.*
  FROM public.scorecards sc
  WHERE sc.is_shared IS TRUE
    AND sc.share_token = v_token
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_scorecard(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_scorecard(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_shared_scorecard(TEXT) TO authenticated;
