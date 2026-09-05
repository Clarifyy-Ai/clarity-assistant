ALTER FUNCTION public.protect_mfa_reenrollment_required() SET search_path = public;
ALTER FUNCTION public.validate_full_name() SET search_path = public;

DROP POLICY IF EXISTS "eac_select_own" ON public.exam_attempt_cohorts;
CREATE POLICY "eac_select_own" ON public.exam_attempt_cohorts
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.exam_ranks r
    WHERE r.cohort_id = exam_attempt_cohorts.id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "learning_quizzes_select" ON public.learning_quizzes;
CREATE POLICY "learning_quizzes_select" ON public.learning_quizzes
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.learning_courses c
    WHERE c.id = learning_quizzes.course_id
      AND (c.publish_status = 'published' OR c.created_by = auth.uid())
  )
);