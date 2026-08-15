-- Completing a session updates xp/total_sessions via trg_session_streak.
-- That trigger ran as the caller, so profiles_own_update_allowed rejected the
-- privileged-column change and PostgREST returned 403 on sessions PATCH.
-- Also add mock_tests.overall_score which the papers UI already selects.

CREATE OR REPLACE FUNCTION public.update_user_streak()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_last DATE; v_today DATE := CURRENT_DATE;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    SELECT last_active_date INTO v_last FROM profiles WHERE id = NEW.user_id;
    IF v_last IS NULL OR v_last < v_today - INTERVAL '1 day' THEN
      UPDATE profiles SET streak_days = 1, last_active_date = v_today,
        total_sessions = total_sessions + 1, xp = xp + 10, updated_at = NOW()
      WHERE id = NEW.user_id;
    ELSIF v_last = v_today - INTERVAL '1 day' THEN
      UPDATE profiles SET
        streak_days = streak_days + 1,
        longest_streak = GREATEST(longest_streak, streak_days + 1),
        last_active_date = v_today, total_sessions = total_sessions + 1,
        xp = xp + 15, updated_at = NOW()
      WHERE id = NEW.user_id;
    ELSE
      UPDATE profiles SET last_active_date = v_today,
        total_sessions = total_sessions + 1, xp = xp + 5, updated_at = NOW()
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_streak() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.assemble_assessment_from_template(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coding_hidden_cases_for_scoring(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_course_certificate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assemble_assessment_from_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coding_hidden_cases_for_scoring(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_course_certificate(uuid) TO authenticated;

-- Public certificate lookup is intentional; keep anon+authenticated EXECUTE.
ALTER FUNCTION public.verify_course_certificate(text) SET search_path = public;
REVOKE ALL ON FUNCTION public.verify_course_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_course_certificate(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_unknown_license_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.publish_status = 'published' AND COALESCE(NEW.license_type, 'UNKNOWN') = 'UNKNOWN' THEN
    RAISE EXCEPTION 'UNKNOWN license content cannot be published to public assessments';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS overall_score numeric;

UPDATE public.mock_tests m
SET overall_score = a.total_score
FROM public.test_analyses a
WHERE a.test_id = m.id AND m.overall_score IS NULL;
