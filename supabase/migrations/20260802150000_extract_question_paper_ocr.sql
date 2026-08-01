-- OCR / PDF extract stages for previous-year paper ingestion.
-- Never auto-publishes OCR output; questions stay is_public=false until review.

BEGIN;

-- Expand durable job statuses for extract / OCR pipeline
ALTER TABLE public.source_ingestion_jobs
  DROP CONSTRAINT IF EXISTS source_ingestion_jobs_status_check;

ALTER TABLE public.source_ingestion_jobs
  ADD CONSTRAINT source_ingestion_jobs_status_check
  CHECK (status IN (
    'queued',
    'validating_url',
    'registering_source',
    'awaiting_payload',
    'extracting',
    'normalizing',
    'validating_questions',
    'inserting_questions',
    'linking_paper',
    'completed',
    'failed',
    'cancelled'
  ));

-- Per-question provenance / OCR audit (raw vs normalized live in metadata.ocr)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.questions.metadata IS
  'Provenance and OCR audit. OCR extracts set needs_review=true and never auto-publish.';

CREATE INDEX IF NOT EXISTS idx_questions_metadata_needs_review
  ON public.questions ((metadata->>'needs_review'))
  WHERE (metadata->>'needs_review') = 'true';

COMMENT ON TABLE public.source_ingestion_jobs IS
  'Durable admin ingestion jobs. Supports metadata/JSON ingest and admin PDF/OCR extract; never auto-publishes OCR.';

COMMIT;
