-- Persist the exact validation policy used for every Government Exam artifact.
BEGIN;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS quality_algorithm_version text,
  ADD COLUMN IF NOT EXISTS duplicate_algorithm_version text,
  ADD COLUMN IF NOT EXISTS generator_version text,
  ADD COLUMN IF NOT EXISTS generation_method text,
  ADD COLUMN IF NOT EXISTS source_template text,
  ADD COLUMN IF NOT EXISTS source_question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL;

ALTER TABLE public.gov_generated_papers
  ADD COLUMN IF NOT EXISTS quality_algorithm_version text,
  ADD COLUMN IF NOT EXISTS duplicate_algorithm_version text;

ALTER TABLE public.gov_generated_paper_questions
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS duplicate_status text NOT NULL DEFAULT 'unique',
  ADD COLUMN IF NOT EXISTS quality_algorithm_version text,
  ADD COLUMN IF NOT EXISTS duplicate_algorithm_version text;

COMMENT ON COLUMN public.questions.quality_algorithm_version IS
  'Version of the content-quality policy that produced quality_score.';
COMMENT ON COLUMN public.questions.duplicate_algorithm_version IS
  'Version of the exact/near-duplicate policy used for acceptance.';
COMMENT ON COLUMN public.gov_generated_papers.quality_algorithm_version IS
  'Quality policy version used before publication.';
COMMENT ON COLUMN public.gov_generated_papers.duplicate_algorithm_version IS
  'Duplicate policy version used before publication.';

CREATE INDEX IF NOT EXISTS questions_quality_algorithm_version_idx
  ON public.questions (quality_algorithm_version);

COMMIT;
