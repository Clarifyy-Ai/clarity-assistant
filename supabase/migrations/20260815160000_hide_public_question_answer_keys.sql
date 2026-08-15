-- SEC-002: public question rows must not expose answer keys via the Data API.
-- Playable fetches go through questions_playable (no correct_answer / explanation).
-- Authors still SELECT their own questions (including keys). Admins keep questions_admin_all.
-- Completed attempts can still read keys for results / revision review.
-- Do not REVOKE column-level SELECT on correct_answer — that would break author/admin editors.

DROP VIEW IF EXISTS public.questions_playable;
CREATE VIEW public.questions_playable
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  id,
  question_text,
  question_html,
  question_type,
  options,
  subject,
  topic,
  subtopic,
  category,
  tags,
  difficulty,
  exam_type,
  source,
  source_year,
  source_paper,
  marks_positive,
  marks_negative,
  time_limit_seconds,
  has_image,
  image_url,
  latex_present,
  is_verified,
  is_public,
  uploaded_by,
  created_at
FROM public.questions
WHERE
  is_public = true
  OR uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.mock_tests mt
    WHERE mt.user_id = auth.uid()
      AND mt.question_ids @> ARRAY[questions.id]
  );

REVOKE ALL ON public.questions_playable FROM PUBLIC, anon;
GRANT SELECT ON public.questions_playable TO authenticated, service_role;

DROP POLICY IF EXISTS "questions_select" ON public.questions;
DROP POLICY IF EXISTS questions_select ON public.questions;
CREATE POLICY questions_select ON public.questions
  FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid());

DROP POLICY IF EXISTS questions_select_own_attempts ON public.questions;
CREATE POLICY questions_select_own_attempts ON public.questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mock_tests mt
      WHERE mt.user_id = auth.uid()
        AND mt.status = 'COMPLETED'
        AND mt.question_ids @> ARRAY[questions.id]
    )
  );
