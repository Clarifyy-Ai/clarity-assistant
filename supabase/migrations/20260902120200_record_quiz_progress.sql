BEGIN;

-- Record learning quiz attempts, upsert quiz_progress, and recompute enrollment
-- percentage from completed lessons plus passed quizzes (same weighting as client).
CREATE OR REPLACE FUNCTION public.record_quiz_progress(
  p_quiz_id uuid,
  p_score numeric,
  p_passed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_course_id uuid;
  v_total_lessons integer;
  v_total_quizzes integer;
  v_total_units integer;
  v_completed_lessons integer;
  v_passed_quizzes integer;
  v_percentage numeric(5,2);
  v_has_final boolean;
  v_final_passed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT q.course_id INTO v_course_id
  FROM public.learning_quizzes q
  JOIN public.learning_courses c ON c.id = q.course_id
  WHERE q.id = p_quiz_id AND c.publish_status = 'published';
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Quiz is not available';
  END IF;

  INSERT INTO public.course_enrollments (user_id, course_id, last_accessed)
  VALUES (v_user, v_course_id, now())
  ON CONFLICT (user_id, course_id)
  DO UPDATE SET last_accessed = EXCLUDED.last_accessed;

  INSERT INTO public.quiz_progress (user_id, quiz_id, score, last_accessed, completed_at)
  VALUES (
    v_user,
    p_quiz_id,
    p_score,
    now(),
    CASE WHEN p_passed THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id, quiz_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    last_accessed = EXCLUDED.last_accessed,
    completed_at = CASE
      WHEN p_passed THEN COALESCE(public.quiz_progress.completed_at, EXCLUDED.completed_at)
      ELSE public.quiz_progress.completed_at
    END;

  SELECT count(*) INTO v_total_lessons
  FROM public.learning_lessons l
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE m.course_id = v_course_id;

  SELECT count(*) INTO v_total_quizzes
  FROM public.learning_quizzes q
  WHERE q.course_id = v_course_id;

  v_total_units := v_total_lessons + v_total_quizzes;

  SELECT count(*) INTO v_completed_lessons
  FROM public.lesson_progress lp
  JOIN public.learning_lessons l ON l.id = lp.lesson_id
  JOIN public.learning_modules m ON m.id = l.module_id
  WHERE lp.user_id = v_user
    AND m.course_id = v_course_id
    AND lp.completed_at IS NOT NULL;

  SELECT count(*) INTO v_passed_quizzes
  FROM public.quiz_progress qp
  JOIN public.learning_quizzes q ON q.id = qp.quiz_id
  WHERE qp.user_id = v_user
    AND q.course_id = v_course_id
    AND qp.completed_at IS NOT NULL;

  v_percentage := CASE
    WHEN v_total_units = 0 THEN 0
    ELSE round(100.0 * (v_completed_lessons + v_passed_quizzes) / v_total_units, 2)
  END;

  SELECT EXISTS (
    SELECT 1 FROM public.learning_quizzes q
    WHERE q.course_id = v_course_id AND q.is_final = true
  ) INTO v_has_final;

  SELECT EXISTS (
    SELECT 1
    FROM public.quiz_progress qp
    JOIN public.learning_quizzes q ON q.id = qp.quiz_id
    WHERE qp.user_id = v_user
      AND q.course_id = v_course_id
      AND q.is_final = true
      AND qp.completed_at IS NOT NULL
  ) INTO v_final_passed;

  UPDATE public.course_enrollments
  SET percentage = v_percentage,
      completed_at = CASE
        WHEN v_percentage >= 100 AND (NOT v_has_final OR v_final_passed)
          THEN COALESCE(completed_at, now())
        ELSE NULL
      END,
      last_accessed = now()
  WHERE user_id = v_user AND course_id = v_course_id;

  RETURN jsonb_build_object(
    'course_id', v_course_id,
    'quiz_id', p_quiz_id,
    'score', p_score,
    'passed', p_passed,
    'percentage', v_percentage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_quiz_progress(uuid, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_quiz_progress(uuid, numeric, boolean) TO authenticated;

COMMIT;
