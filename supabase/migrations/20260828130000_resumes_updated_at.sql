-- Add updated_at to resumes for dedupe ordering and client queries.
-- Additive only — does not modify prior migration history.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.resumes
SET updated_at = created_at
WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS trg_resumes_updated_at ON public.resumes;
CREATE TRIGGER trg_resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.resumes.updated_at IS
  'Last update timestamp; used for duplicate resume ordering and UI sort.';
