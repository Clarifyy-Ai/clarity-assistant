-- Unpublish duplicate public stems (keep one per exam_type + normalized text).
-- Then prevent new public duplicates.

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY coalesce(exam_type, ''),
        md5(lower(regexp_replace(trim(coalesce(question_text, '')), '\s+', ' ', 'g')))
      ORDER BY is_verified DESC NULLS LAST, is_public DESC NULLS LAST, created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.questions
  WHERE coalesce(question_text, '') <> ''
)
UPDATE public.questions q
SET
  is_public = false,
  updated_at = now(),
  metadata = coalesce(q.metadata, '{}'::jsonb) || jsonb_build_object('duplicate_unpublished', true)
FROM ranked r
WHERE q.id = r.id
  AND r.rn > 1
  AND coalesce(q.is_public, true) = true;

UPDATE public.questions q
SET is_verified = true, updated_at = now()
WHERE q.is_public = true
  AND coalesce(q.is_verified, false) = false
  AND length(trim(q.question_text)) >= 10
  AND q.correct_answer IS NOT NULL
  AND length(trim(q.correct_answer)) > 0;

UPDATE public.gov_exams
SET legacy_exam_type = 'RRB NTPC'
WHERE code = 'RRB_NTPC' AND legacy_exam_type = 'GENERAL';

CREATE UNIQUE INDEX IF NOT EXISTS questions_public_exam_stem_uidx
ON public.questions (
  exam_type,
  md5(lower(regexp_replace(trim(question_text), '\s+', ' ', 'g')))
)
WHERE is_public = true AND question_text IS NOT NULL AND length(trim(question_text)) > 0;
