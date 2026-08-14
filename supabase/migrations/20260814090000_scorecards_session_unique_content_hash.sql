-- One scorecard per session; content-hash uniqueness for resume/JD/document dedupe.

DELETE FROM public.scorecards a
USING public.scorecards b
WHERE a.session_id IS NOT NULL
  AND a.session_id = b.session_id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_scorecards_session_id
  ON public.scorecards (session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE public.job_descriptions
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

DELETE FROM public.resumes a
USING public.resumes b
WHERE a.content_hash IS NOT NULL
  AND a.user_id = b.user_id
  AND a.content_hash = b.content_hash
  AND a.id < b.id;

DELETE FROM public.job_descriptions a
USING public.job_descriptions b
WHERE a.content_hash IS NOT NULL
  AND a.user_id = b.user_id
  AND a.content_hash = b.content_hash
  AND a.id < b.id;

DELETE FROM public.documents a
USING public.documents b
WHERE a.content_hash IS NOT NULL
  AND a.user_id = b.user_id
  AND a.type = b.type
  AND a.content_hash = b.content_hash
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_user_content_hash_unique
  ON public.resumes (user_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_descriptions_user_content_hash
  ON public.job_descriptions (user_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_user_type_content_hash
  ON public.documents (user_id, type, content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN public.documents.content_hash IS
  'SHA-256 of file/text bytes for per-user duplicate detection.';
COMMENT ON COLUMN public.job_descriptions.content_hash IS
  'SHA-256 of JD text/file bytes for per-user duplicate detection.';
