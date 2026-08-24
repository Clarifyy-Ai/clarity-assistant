-- Canonical question lifecycle and publication guard.
BEGIN;

ALTER TABLE public.questions
  ALTER COLUMN is_public SET DEFAULT false,
  ALTER COLUMN is_verified SET DEFAULT false;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_review_status_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_review_status_check
  CHECK (review_status IN ('draft', 'review_required', 'unreviewed', 'approved', 'rejected', 'archived'));

CREATE OR REPLACE FUNCTION public.validate_question_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  labels text[];
  answer text;
BEGIN
  IF NEW.publish_status = 'published' OR NEW.is_public IS TRUE THEN
    IF NEW.review_status <> 'approved' OR NEW.is_verified IS NOT TRUE THEN
      RAISE EXCEPTION 'Question must be approved and verified before publication';
    END IF;
    IF COALESCE(NEW.validation_status, 'unvalidated') <> 'valid' THEN
      RAISE EXCEPTION 'Question must pass validation before publication';
    END IF;
    IF COALESCE(NEW.license_type, 'UNKNOWN') = 'UNKNOWN' THEN
      RAISE EXCEPTION 'Question provenance/license is required before publication';
    END IF;
    IF btrim(COALESCE(NEW.question_text, '')) = ''
       OR btrim(COALESCE(NEW.explanation, '')) = '' THEN
      RAISE EXCEPTION 'Question text and explanation are required before publication';
    END IF;
    IF btrim(COALESCE(NEW.subject, '')) = ''
       OR btrim(COALESCE(NEW.topic, '')) = ''
       OR upper(COALESCE(NEW.difficulty, '')) NOT IN ('EASY', 'MEDIUM', 'HARD') THEN
      RAISE EXCEPTION 'Subject, topic, and valid difficulty are required before publication';
    END IF;
    IF upper(COALESCE(NEW.question_type, 'MCQ')) = 'MCQ' THEN
      IF jsonb_typeof(NEW.options) <> 'array'
         OR jsonb_array_length(NEW.options) <> 4 THEN
        RAISE EXCEPTION 'MCQ questions require exactly four options';
      END IF;
      labels := public.assessment_option_labels(NEW.options);
      IF cardinality(labels) <> 4 THEN
        RAISE EXCEPTION 'MCQ options must have four non-empty labels';
      END IF;
      IF labels <> ARRAY['A', 'B', 'C', 'D']::text[] THEN
        RAISE EXCEPTION 'MCQ option labels must be A, B, C, and D';
      END IF;
      IF (SELECT count(DISTINCT lower(btrim(value->>'text')))
          FROM jsonb_array_elements(NEW.options) AS item(value)) <> 4 THEN
        RAISE EXCEPTION 'MCQ option text must be unique';
      END IF;
      answer := upper(btrim(COALESCE(NEW.correct_answer, '')));
      IF answer = '' OR NOT (answer = ANY(labels)) THEN
        RAISE EXCEPTION 'Correct answer must reference an existing option';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_validate_publication ON public.questions;
CREATE TRIGGER questions_validate_publication
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.validate_question_publication();

DROP POLICY IF EXISTS "questions_select" ON public.questions;
CREATE POLICY "questions_select" ON public.questions FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      is_public = true
      AND publish_status = 'published'
      AND review_status = 'approved'
      AND is_verified = true
    )
  );

DROP POLICY IF EXISTS "questions_insert_lifecycle" ON public.questions;
DROP POLICY IF EXISTS "questions_insert" ON public.questions;
CREATE POLICY "questions_insert_lifecycle" ON public.questions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR uploaded_by = auth.uid());

DROP POLICY IF EXISTS "questions_update_lifecycle" ON public.questions;
DROP POLICY IF EXISTS "questions_update" ON public.questions;
CREATE POLICY "questions_update_lifecycle" ON public.questions FOR UPDATE TO authenticated
  USING (public.is_admin() OR uploaded_by = auth.uid())
  WITH CHECK (public.is_admin() OR uploaded_by = auth.uid());

DROP POLICY IF EXISTS "questions_delete_lifecycle" ON public.questions;
DROP POLICY IF EXISTS "questions_delete" ON public.questions;
CREATE POLICY "questions_delete_lifecycle" ON public.questions FOR DELETE TO authenticated
  USING (public.is_admin() OR uploaded_by = auth.uid());

COMMIT;
