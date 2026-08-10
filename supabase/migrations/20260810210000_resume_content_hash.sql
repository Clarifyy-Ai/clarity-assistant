-- Content hash for resume parse dedupe (per-user). Prevents double-charge on identical uploads.
ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_resumes_user_content_hash
  ON public.resumes (user_id, content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN public.resumes.content_hash IS
  'SHA-256 hex of file bytes; used by parse-resume to skip duplicate charges for identical content.';
