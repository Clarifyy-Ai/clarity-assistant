-- Mark gap analyses stale when the source resume or JD content changes.

CREATE OR REPLACE FUNCTION public.mark_gap_analyses_stale_for_resume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.gap_analyses
     SET stale = true, updated_at = now()
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
     SET stale = true, updated_at = now()
   WHERE jd_id = NEW.id
     AND user_id = NEW.user_id
     AND stale = false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gap_analyses_stale_resume ON public.resumes;
CREATE TRIGGER trg_gap_analyses_stale_resume
AFTER UPDATE OF content, content_hash ON public.resumes
FOR EACH ROW
WHEN (
  OLD.content IS DISTINCT FROM NEW.content
  OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
)
EXECUTE FUNCTION public.mark_gap_analyses_stale_for_resume();

DROP TRIGGER IF EXISTS trg_gap_analyses_stale_jd ON public.job_descriptions;
CREATE TRIGGER trg_gap_analyses_stale_jd
AFTER UPDATE OF content, content_hash ON public.job_descriptions
FOR EACH ROW
WHEN (
  OLD.content IS DISTINCT FROM NEW.content
  OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
)
EXECUTE FUNCTION public.mark_gap_analyses_stale_for_jd();
