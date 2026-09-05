-- SEC-P0: Prevent authenticated users from reading published question answer keys
-- via direct SELECT on public.questions. Playable attempts use questions_playable;
-- post-submit review uses get_owned_mock_test_question_review (ownership + COMPLETED).

BEGIN;

DROP POLICY IF EXISTS "questions_select" ON public.questions;
CREATE POLICY "questions_select" ON public.questions FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR uploaded_by = auth.uid()
  );

COMMENT ON POLICY "questions_select" ON public.questions IS
  'Owners and admins only on base table. Published catalog reads use questions_playable; completed test review uses get_owned_mock_test_question_review.';

CREATE OR REPLACE FUNCTION public.get_owned_mock_test_question_review(p_test_id uuid)
RETURNS TABLE (
  id uuid,
  question_text text,
  question_type text,
  correct_answer text,
  explanation text,
  subject text,
  topic text,
  difficulty text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.question_text,
    q.question_type,
    q.correct_answer,
    q.explanation,
    q.subject,
    q.topic,
    q.difficulty
  FROM public.mock_tests mt
  JOIN public.questions q ON q.id = ANY(COALESCE(mt.question_ids, ARRAY[]::uuid[]))
  WHERE mt.id = p_test_id
    AND mt.user_id = auth.uid()
    AND upper(trim(COALESCE(mt.status, ''))) = 'COMPLETED';
$$;

REVOKE ALL ON FUNCTION public.get_owned_mock_test_question_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owned_mock_test_question_review(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_owned_mock_test_question_review(uuid) IS
  'Returns answer keys for a completed mock test owned by the caller only.';

COMMIT;
