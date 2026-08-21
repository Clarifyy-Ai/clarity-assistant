-- Gap Analysis versioning, historical preservation, and unparsed document gates.

BEGIN;

ALTER TABLE public.gap_analyses
  ADD COLUMN IF NOT EXISTS resume_version text,
  ADD COLUMN IF NOT EXISTS jd_version text,
  ADD COLUMN IF NOT EXISTS resume_content_hash text,
  ADD COLUMN IF NOT EXISTS jd_content_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'stale', 'failed_recoverable', 'pending')),
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Drop old single-entry unique constraint to preserve historical analyses
DROP INDEX IF EXISTS public.gap_analyses_user_sources_idx;

-- New unique constraint per document version snapshot
CREATE UNIQUE INDEX IF NOT EXISTS gap_analyses_versioned_idx
  ON public.gap_analyses (user_id, resume_id, jd_id, COALESCE(resume_version, ''), COALESCE(jd_version, ''));

CREATE INDEX IF NOT EXISTS idx_gap_analyses_user_lookup
  ON public.gap_analyses (user_id, resume_id, jd_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gap_analyses_active
  ON public.gap_analyses (user_id, resume_id, jd_id)
  WHERE stale = false;

-- Enhance triggers to set status = 'stale' when source changes
CREATE OR REPLACE FUNCTION public.mark_gap_analyses_stale_for_resume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.gap_analyses
     SET stale = true,
         status = 'stale',
         updated_at = now()
   WHERE resume_id = NEW.id
     AND user_id = NEW.user_id
     AND stale = false;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_gap_analyses_stale_for_jd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.gap_analyses
     SET stale = true,
         status = 'stale',
         updated_at = now()
   WHERE jd_id = NEW.id
     AND user_id = NEW.user_id
     AND stale = false;
  RETURN NEW;
END;
$$;

COMMIT;
