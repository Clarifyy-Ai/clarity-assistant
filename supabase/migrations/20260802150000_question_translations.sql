-- Regional question translations with human review gate.
-- Public may read only approved rows; admins (is_admin()) may write all states.
-- Machine drafts must land as needs_review — never auto-approve.

BEGIN;

CREATE TABLE IF NOT EXISTS public.question_translations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  language        text NOT NULL,
  question_text   text NOT NULL,
  options         jsonb,
  explanation     text,
  review_state    text NOT NULL DEFAULT 'needs_review'
                  CHECK (review_state IN (
                    'draft',
                    'needs_review',
                    'approved',
                    'rejected'
                  )),
  reviewer_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_version  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, language)
);

CREATE INDEX IF NOT EXISTS question_translations_language_idx
  ON public.question_translations (language);

CREATE INDEX IF NOT EXISTS question_translations_review_state_idx
  ON public.question_translations (review_state);

CREATE INDEX IF NOT EXISTS question_translations_question_id_idx
  ON public.question_translations (question_id);

COMMENT ON TABLE public.question_translations IS
  'Human-reviewed regional translations of bank questions. Only review_state=approved is public.';

ALTER TABLE public.question_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS question_translations_public_read_approved
  ON public.question_translations;
CREATE POLICY question_translations_public_read_approved
  ON public.question_translations
  FOR SELECT
  USING (review_state = 'approved');

DROP POLICY IF EXISTS question_translations_admin_all
  ON public.question_translations;
CREATE POLICY question_translations_admin_all
  ON public.question_translations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
