-- Server-backed scorecard share tokens.
-- Clients cannot UPDATE scorecards (server-authority RLS); share must go through this RPC.

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
  v_share_allowed BOOLEAN;
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

  -- Match client parsePrivacyPrefs: missing share_scorecard defaults to allowed (true).
  v_share_allowed := COALESCE(
    CASE
      WHEN v_prefs ? 'share_scorecard' THEN (v_prefs->>'share_scorecard')::boolean
      ELSE TRUE
    END,
    TRUE
  );

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

REVOKE ALL ON FUNCTION public.create_scorecard_share(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_scorecard_share(UUID) TO authenticated;

COMMENT ON FUNCTION public.create_scorecard_share(UUID) IS
  'Owner-only: mint or reuse a public scorecard share token after privacy check.';
