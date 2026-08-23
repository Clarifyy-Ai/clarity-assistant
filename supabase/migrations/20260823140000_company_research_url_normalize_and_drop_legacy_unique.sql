-- WS11: Drop leftover display-name unique; URL-aware company identity normalization.
-- Additive only — does not edit prior migrations.

CREATE OR REPLACE FUNCTION public.normalize_company_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  s text;
  looks_like_url boolean;
BEGIN
  s := COALESCE(p_name, '');
  IF s = '' THEN
    RETURN NULL;
  END IF;

  looks_like_url :=
    s ~* '^https?://'
    OR s ~* '^www\.'
    OR (
      s ~* '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(/.*)?$'
      AND position(' ' IN trim(s)) = 0
    );

  IF looks_like_url THEN
    s := lower(trim(s));
    s := regexp_replace(s, '^https?://', '', 'i');
    s := regexp_replace(s, '^www\.', '', 'i');
    s := regexp_replace(s, '/+$', '');
    IF position('/' IN s) > 0 THEN
      s := split_part(s, '/', 1);
    END IF;
  END IF;

  s := lower(trim(regexp_replace(s, '\s+', ' ', 'g')));
  IF s = '' THEN
    RETURN NULL;
  END IF;
  RETURN s;
END;
$$;

COMMENT ON FUNCTION public.normalize_company_name(text) IS
  'Canonical company identity: URL/host stripping when applicable, then lower(trim(collapse whitespace)). NULL when empty.';

-- Re-sync normalized column for rows whose identity changes under URL rules.
UPDATE public.company_research cr
SET company_name_normalized = COALESCE(
  public.normalize_company_name(cr.company_name),
  'unnamed-company-' || cr.id::text
)
WHERE company_name_normalized IS DISTINCT FROM COALESCE(
  public.normalize_company_name(cr.company_name),
  'unnamed-company-' || cr.id::text
);

-- Dedupe if URL normalization merged identities for the same user.
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

-- Drop legacy display-name unique if still present (migration 20260823041904 intended this).
ALTER TABLE public.company_research
  DROP CONSTRAINT IF EXISTS company_research_user_company_unique;
