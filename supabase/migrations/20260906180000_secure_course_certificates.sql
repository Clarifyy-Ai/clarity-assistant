-- Certificates contain learner identity and achievement data. Verification now
-- requires the signed-in certificate owner, and stale/ineligible records are removed.
DELETE FROM public.course_certificates AS certificate
WHERE EXISTS (
  SELECT 1
  FROM public.learning_modules AS module
  JOIN public.learning_lessons AS lesson ON lesson.module_id = module.id
  WHERE module.course_id = certificate.course_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.lesson_progress AS progress
      WHERE progress.user_id = certificate.user_id
        AND progress.lesson_id = lesson.id
        AND progress.completed_at IS NOT NULL
    )
)
OR EXISTS (
  SELECT 1
  FROM public.learning_quizzes AS quiz
  WHERE quiz.course_id = certificate.course_id
    AND quiz.is_final = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.quiz_progress AS progress
      WHERE progress.user_id = certificate.user_id
        AND progress.quiz_id = quiz.id
        AND progress.completed_at IS NOT NULL
        AND progress.score >= quiz.passing_percentage
    )
);

CREATE OR REPLACE FUNCTION public.verify_course_certificate(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.course_certificates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.course_certificates
  WHERE certificate_code = p_code
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'certificate_code', v_row.certificate_code,
    'student_name', v_row.student_name,
    'course_name', v_row.course_name,
    'issued_at', v_row.issued_at,
    'course_duration_hours', v_row.course_duration_hours,
    'completion_percentage', v_row.completion_percentage,
    'kind', 'Course Completion Certificate'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_course_certificate(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_course_certificate(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_course_certificate(text) TO authenticated;
