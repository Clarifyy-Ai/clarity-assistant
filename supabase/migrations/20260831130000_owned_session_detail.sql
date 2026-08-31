-- Owner-scoped session detail for TC-SES-002 (no cross-user joins).

CREATE OR REPLACE FUNCTION public.get_owned_session_detail(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session jsonb;
  v_answers jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(s) INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id
     AND s.user_id = v_uid;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object('found', false, 'session', NULL, 'answers', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]'::jsonb)
    INTO v_answers
    FROM public.session_answers a
   WHERE a.session_id = p_session_id
     AND a.user_id = v_uid;

  RETURN jsonb_build_object('found', true, 'session', v_session, 'answers', v_answers);
END;
$$;

REVOKE ALL ON FUNCTION public.get_owned_session_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owned_session_detail(uuid) TO authenticated;
