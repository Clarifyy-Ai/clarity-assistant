-- Align create_scorecard_share privacy gate with client resolveShareScorecardAllowed
-- (string booleans + legacy allow_scorecard_sharing key).

CREATE OR REPLACE FUNCTION public.create_scorecard_share(p_session_id UUID)
RETURNS TABLE (share_token TEXT, share_url_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_token TEXT;
  v_prefs JSONB;
  v_share_allowed BOOLEAN := TRUE;
  v_raw TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.privacy_prefs INTO v_prefs
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_prefs IS NOT NULL THEN
    IF v_prefs ? 'share_scorecard' THEN
      v_raw := v_prefs->>'share_scorecard';
      v_share_allowed := CASE
        WHEN v_raw IS NULL THEN TRUE
        WHEN lower(trim(v_raw)) IN ('true', '1', 'yes') THEN TRUE
        WHEN lower(trim(v_raw)) IN ('false', '0', 'no') THEN FALSE
        ELSE TRUE
      END;
    ELSIF v_prefs ? 'allow_scorecard_sharing' THEN
      v_raw := v_prefs->>'allow_scorecard_sharing';
      v_share_allowed := CASE
        WHEN v_raw IS NULL THEN TRUE
        WHEN lower(trim(v_raw)) IN ('true', '1', 'yes') THEN TRUE
        WHEN lower(trim(v_raw)) IN ('false', '0', 'no') THEN FALSE
        ELSE TRUE
      END;
    END IF;
  END IF;

  IF v_share_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'Scorecard sharing is turned off in privacy settings'
      USING ERRCODE = '42501';
  END IF;

  SELECT sc.share_token
  INTO v_token
  FROM public.scorecards sc
  WHERE sc.session_id = p_session_id
    AND sc.user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scorecard not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_token IS NULL OR length(trim(v_token)) < 16 THEN
    v_token := encode(gen_random_bytes(16), 'hex');
    UPDATE public.scorecards sc
    SET
      is_shared = TRUE,
      share_token = v_token
    WHERE sc.session_id = p_session_id
      AND sc.user_id = v_uid;
  ELSE
    UPDATE public.scorecards sc
    SET is_shared = TRUE
    WHERE sc.session_id = p_session_id
      AND sc.user_id = v_uid
      AND (sc.is_shared IS DISTINCT FROM TRUE);
  END IF;

  share_token := v_token;
  share_url_path := '/share/' || v_token;
  RETURN NEXT;
END;
$$;
