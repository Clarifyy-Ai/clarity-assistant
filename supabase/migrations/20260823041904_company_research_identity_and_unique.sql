-- WS17: Canonical company identity + unique (user_id, company_name_normalized).
-- Additive only. Does not rewrite historical migrations.

CREATE OR REPLACE FUNCTION public.normalize_company_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(
    lower(trim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'))),
    ''
  );
$$;

COMMENT ON FUNCTION public.normalize_company_name(text) IS
  'Canonical company identity: lower(trim(collapse internal whitespace)). NULL when empty.';

ALTER TABLE public.company_research
  ADD COLUMN IF NOT EXISTS company_name_normalized text;

-- Backfill and dedupe run without the sync trigger so historical rows with
-- unnormalizable names do not abort the migration.
DROP TRIGGER IF EXISTS trg_company_research_set_normalized ON public.company_research;

-- Backfill. Rows whose display name cannot normalize keep a per-row fallback so
-- the NOT NULL + UNIQUE identity can be enforced without deleting user data.
UPDATE public.company_research
SET company_name_normalized = COALESCE(
  public.normalize_company_name(company_name),
  'unnamed-company-' || id::text
)
WHERE company_name_normalized IS NULL
   OR company_name_normalized IS DISTINCT FROM COALESCE(
        public.normalize_company_name(company_name),
        'unnamed-company-' || id::text
      );

-- Keep the newest row per (user_id, normalized name); drop older duplicates so
-- the unique constraint can be created.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, company_name_normalized
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.company_research
)
DELETE FROM public.company_research cr
USING ranked r
WHERE cr.id = r.id
  AND r.rn > 1;

ALTER TABLE public.company_research
  ALTER COLUMN company_name_normalized SET NOT NULL;

COMMENT ON COLUMN public.company_research.company_name_normalized IS
  'Server-maintained canonical identity used as the upsert conflict target. Never written by clients.';

-- Trigger keeps the canonical identity in sync; clients cannot forge it.
CREATE OR REPLACE FUNCTION public.company_research_set_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.company_name_normalized := public.normalize_company_name(NEW.company_name);
  IF NEW.company_name_normalized IS NULL THEN
    RAISE EXCEPTION 'company_name must be a non-empty name'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_research_set_normalized ON public.company_research;
CREATE TRIGGER trg_company_research_set_normalized
  BEFORE INSERT OR UPDATE OF company_name, company_name_normalized
  ON public.company_research
  FOR EACH ROW
  EXECUTE FUNCTION public.company_research_set_normalized();

ALTER TABLE public.company_research
  DROP CONSTRAINT IF EXISTS company_research_user_company_unique;

ALTER TABLE public.company_research
  DROP CONSTRAINT IF EXISTS company_research_user_company_normalized_unique;

-- Unique identity: also the ON CONFLICT target used by the company-research Edge Function.
-- The constraint's backing index covers (user_id, company_name_normalized) lookups.
ALTER TABLE public.company_research
  ADD CONSTRAINT company_research_user_company_normalized_unique
  UNIQUE (user_id, company_name_normalized);
