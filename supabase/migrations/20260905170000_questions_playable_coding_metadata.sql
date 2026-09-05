-- Expose question metadata for coding playground during mock-test attempts.
-- Hidden coding judge cases are stripped client-side in stripAnswerKeys().

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
  created_at,
  metadata
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
