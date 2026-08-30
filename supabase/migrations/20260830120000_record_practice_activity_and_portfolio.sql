-- Additive: practice streak RPC, portfolio URL, in-app notification create.
-- Does not rewrite applied history.

CREATE OR REPLACE FUNCTION public.record_practice_activity(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target uuid;
  v_last date;
  v_today date := CURRENT_DATE;
  v_streak integer := 0;
  v_longest integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED'
      USING ERRCODE = 'P0001', MESSAGE = 'Authentication required.';
  END IF;

  target := COALESCE(p_user_id, uid);
  IF target <> uid THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = 'P0001', MESSAGE = 'You can only record your own practice activity.';
  END IF;

  SELECT last_active_date, streak_days, longest_streak
    INTO v_last, v_streak, v_longest
  FROM public.profiles
  WHERE id = target
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND'
    );
  END IF;

  IF v_last IS NULL OR v_last < v_today - INTERVAL '1 day' THEN
    v_streak := 1;
  ELSIF v_last = v_today - INTERVAL '1 day' THEN
    v_streak := COALESCE(v_streak, 0) + 1;
  END IF;

  v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);

  UPDATE public.profiles
  SET
    streak_days = v_streak,
    longest_streak = v_longest,
    last_active_date = v_today,
    updated_at = NOW()
  WHERE id = target;

  RETURN jsonb_build_object(
    'success', true,
    'streak_current', v_streak,
    'streak_longest', v_longest,
    'last_activity', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_practice_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_practice_activity(uuid) TO authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portfolio_url text;

GRANT UPDATE (portfolio_url) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.create_own_in_app_notification(
  p_title text,
  p_body text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  nid uuid;
  title_clean text;
  body_clean text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED'
      USING ERRCODE = 'P0001', MESSAGE = 'Authentication required.';
  END IF;

  title_clean := left(btrim(COALESCE(p_title, '')), 200);
  IF title_clean = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR'
      USING ERRCODE = 'P0001', MESSAGE = 'Notification title is required.';
  END IF;

  body_clean := NULLIF(left(btrim(COALESCE(p_body, '')), 1000), '');

  INSERT INTO public.notifications (user_id, title, body, type, is_read)
  VALUES (uid, title_clean, body_clean, 'system', false)
  RETURNING id INTO nid;

  RETURN nid;
END;
$$;

REVOKE ALL ON FUNCTION public.create_own_in_app_notification(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_own_in_app_notification(text, text) TO authenticated;
