BEGIN;

-- Align certificate eligibility with transactional lesson completion:
-- recompute enrollment percentage from lesson_progress before issuing.
CREATE OR REPLACE FUNCTION public.issue_course_certificate(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course public.learning_courses%ROWTYPE;
  v_name text;
  v_code text;
  v_existing public.course_certificates%ROWTYPE;
  v_total integer;
  v_completed integer;
  v_percentage numeric(5,2);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_course FROM public.learning_courses WHERE id = p_course_id AND publish_status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  SELECT * INTO v_existing
  FROM public.course_certificates
  WHERE user_id = v_user AND course_id = p_course_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'certificate_code', v_existing.certificate_code,
      'id', v_existing.id
    );
  END IF;

  SELECT count(*) INTO v_total
  FROM public.learning_lessons l
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE m.course_id = p_course_id;
  SELECT count(*) INTO v_completed
  FROM public.lesson_progress lp
  JOIN public.learning_lessons l ON l.id = lp.lesson_id
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE lp.user_id = v_user AND m.course_id = p_course_id AND lp.completed_at IS NOT NULL;

  v_percentage := CASE WHEN v_total = 0 THEN 0 ELSE round(100.0 * v_completed / v_total, 2) END;

  INSERT INTO public.course_enrollments (user_id, course_id, percentage, completed_at, last_accessed)
  VALUES (
    v_user,
    p_course_id,
    v_percentage,
    CASE WHEN v_percentage >= 100 THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id, course_id)
  DO UPDATE SET
    percentage = EXCLUDED.percentage,
    completed_at = CASE
      WHEN EXCLUDED.percentage >= 100 THEN COALESCE(public.course_enrollments.completed_at, now())
      ELSE NULL
    END,
    last_accessed = EXCLUDED.last_accessed;

  IF v_percentage < 100 THEN
    RAISE EXCEPTION 'Course is not complete';
  END IF;

  SELECT COALESCE(nullif(full_name, ''), split_part(email, '@', 1), 'Learner')
    INTO v_name
  FROM public.profiles
  WHERE id = v_user;

  v_code := 'CLR-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.course_certificates (
    certificate_code, user_id, course_id, student_name, course_name,
    course_duration_hours, completion_percentage, issued_at
  ) VALUES (
    v_code, v_user, p_course_id, COALESCE(v_name, 'Learner'), v_course.title,
    v_course.duration_hours, v_percentage, now()
  )
  ON CONFLICT (user_id, course_id)
  DO UPDATE SET certificate_code = public.course_certificates.certificate_code
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'certificate_code', v_existing.certificate_code,
    'id', v_existing.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_course_certificate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_course_certificate(uuid) TO authenticated;

COMMIT;
