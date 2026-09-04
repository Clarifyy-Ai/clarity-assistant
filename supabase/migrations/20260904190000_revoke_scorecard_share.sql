-- Revoke public scorecard share tokens (owner-only).

CREATE OR REPLACE FUNCTION public.revoke_scorecard_share(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_updated INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.scorecards sc
  SET
    is_shared = FALSE,
    share_token = NULL
  WHERE sc.session_id = p_session_id
    AND sc.user_id = v_uid
    AND (sc.is_shared IS TRUE OR sc.share_token IS NOT NULL);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_scorecard_share(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_scorecard_share(UUID) TO authenticated;

COMMENT ON FUNCTION public.revoke_scorecard_share(UUID) IS
  'Owner-only: clear scorecard share_token and is_shared so public RPCs fail closed.';
