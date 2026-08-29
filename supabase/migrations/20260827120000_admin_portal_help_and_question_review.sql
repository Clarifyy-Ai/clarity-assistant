-- Admin portal: help FAQ uniqueness + archive conflicting free-plan draft.
-- Question review no longer selects questions.quality_score (column absent in prod);
-- this migration optionally adds it for future scoring without breaking older rows.

BEGIN;

-- 1) Archive duplicate free-plan draft so Admin list is not ambiguous.
-- Canonical published FAQ remains slug=gs-3 (50 credits / current pricing copy).
UPDATE public.help_articles
SET
  question = 'Is there a free plan? (archived draft — use gs-3)',
  published = false,
  updated_at = now()
WHERE slug = 'gs-4'
  AND (
    question IS DISTINCT FROM 'Is there a free plan? (archived draft — use gs-3)'
    OR published IS DISTINCT FROM false
  );

-- Keep gs-3 question canonical.
UPDATE public.help_articles
SET
  question = 'Is there a free plan?',
  updated_at = now()
WHERE slug = 'gs-3'
  AND question IS DISTINCT FROM 'Is there a free plan?';

-- 2) At most one published help article per normalized question text.
CREATE UNIQUE INDEX IF NOT EXISTS help_articles_published_question_uidx
  ON public.help_articles (lower(btrim(question)))
  WHERE published = true;

COMMENT ON INDEX public.help_articles_published_question_uidx IS
  'Enforces one published canonical FAQ per question text.';

-- 3) Optional quality_score on questions for admin review displays (nullable).
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS quality_score numeric;

COMMENT ON COLUMN public.questions.quality_score IS
  'Optional content quality score; null when not scored. Admin list must tolerate absence.';

COMMIT;
