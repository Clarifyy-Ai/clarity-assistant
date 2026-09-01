-- Harden get_owned_session_detail so owner detail never HTTP 500s.
-- Root cause: uuid arg coercion + unhandled exceptions + unguarded child queries
-- mapped to PostgREST 500. Return a JSON envelope instead.

DROP FUNCTION IF EXISTS public.get_owned_session_detail(uuid);

CREATE OR REPLACE FUNCTION public.get_owned_session_detail(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_session jsonb;
  v_answers jsonb := '[]'::jsonb;
  v_scorecard jsonb;
  v_transcript jsonb;
  v_debrief jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'code', 'NOT_AUTHENTICATED',
      'session', NULL,
      'answers', '[]'::jsonb,
      'scorecard', NULL,
      'transcript', NULL,
      'debrief', NULL
    );
  END IF;

  BEGIN
    v_sid := NULLIF(btrim(p_session_id), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object(
      'found', false,
      'code', 'NOT_FOUND',
      'session', NULL,
      'answers', '[]'::jsonb,
      'scorecard', NULL,
      'transcript', NULL,
      'debrief', NULL
    );
  END;

  IF v_sid IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'code', 'NOT_FOUND',
      'session', NULL,
      'answers', '[]'::jsonb,
      'scorecard', NULL,
      'transcript', NULL,
      'debrief', NULL
    );
  END IF;

  BEGIN
    SELECT to_jsonb(s) INTO v_session
      FROM public.sessions s
     WHERE s.id = v_sid
       AND s.user_id = v_uid
       AND s.deleted_at IS NULL;
  EXCEPTION WHEN undefined_column THEN
    SELECT to_jsonb(s) INTO v_session
      FROM public.sessions s
     WHERE s.id = v_sid
       AND s.user_id = v_uid;
  END;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'code', 'NOT_FOUND',
      'session', NULL,
      'answers', '[]'::jsonb,
      'scorecard', NULL,
      'transcript', NULL,
      'debrief', NULL
    );
  END IF;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]'::jsonb)
      INTO v_answers
      FROM public.session_answers a
     WHERE a.session_id = v_sid
       AND a.user_id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    v_answers := '[]'::jsonb;
  END;

  BEGIN
    SELECT to_jsonb(sc) INTO v_scorecard
      FROM public.scorecards sc
     WHERE sc.session_id = v_sid
       AND sc.user_id = v_uid
     ORDER BY sc.created_at DESC NULLS LAST
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_scorecard := NULL;
  END;

  BEGIN
    SELECT to_jsonb(t) INTO v_transcript
      FROM public.transcripts t
     WHERE t.session_id = v_sid
       AND t.user_id = v_uid
     ORDER BY t.created_at DESC NULLS LAST
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_transcript := NULL;
  END;

  IF v_transcript IS NULL THEN
    BEGIN
      SELECT jsonb_build_object(
        'content', string_agg(st.content, E'\n' ORDER BY COALESCE(st.sequence, 0), st.created_at),
        'utterances', COALESCE(
          jsonb_agg(to_jsonb(st) ORDER BY COALESCE(st.sequence, 0), st.created_at),
          '[]'::jsonb
        )
      )
        INTO v_transcript
        FROM public.session_transcripts st
       WHERE st.session_id = v_sid
         AND st.user_id = v_uid;
      IF v_transcript IS NULL OR v_transcript->>'content' IS NULL THEN
        v_transcript := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_transcript := NULL;
    END;
  END IF;

  BEGIN
    SELECT to_jsonb(d) INTO v_debrief
      FROM public.session_debriefs d
     WHERE d.session_id = v_sid
       AND d.user_id = v_uid
     ORDER BY d.created_at DESC NULLS LAST
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_debrief := NULL;
  END;

  IF v_debrief IS NULL THEN
    BEGIN
      SELECT to_jsonb(d) INTO v_debrief
        FROM public.debriefs d
       WHERE d.session_id = v_sid
         AND d.user_id = v_uid
       ORDER BY d.created_at DESC NULLS LAST
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_debrief := NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'code', 'OK',
    'session', v_session,
    'answers', COALESCE(v_answers, '[]'::jsonb),
    'scorecard', v_scorecard,
    'transcript', v_transcript,
    'debrief', v_debrief
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_owned_session_detail(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owned_session_detail(text) TO authenticated;

COMMENT ON FUNCTION public.get_owned_session_detail(text) IS
  'Owner-scoped session detail envelope. Never raises for not-found/unauthenticated/invalid id.';
