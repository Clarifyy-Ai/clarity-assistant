-- Hybrid gov-exam registry enrichment: searchable short names, jurisdiction,
-- state PSC codes, verification metadata. Job FSM statuses already expanded in
-- 20260823200000_gov_exam_e2e_hardening.sql — this migration does not reopen that CHECK.

BEGIN;

ALTER TABLE public.gov_exams
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS state_code text,
  ADD COLUMN IF NOT EXISTS jurisdiction text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS publication_notes text;

-- Default jurisdiction from recruiting body when unset; else central.
UPDATE public.gov_exams e
SET jurisdiction = COALESCE(
  e.jurisdiction,
  (
    SELECT rb.jurisdiction
    FROM public.recruiting_bodies rb
    WHERE rb.id = e.recruiting_body_id
  ),
  'central'
)
WHERE e.jurisdiction IS NULL;

ALTER TABLE public.gov_exams
  ALTER COLUMN jurisdiction SET DEFAULT 'central';

UPDATE public.gov_exams
SET short_name = replace(code, '_', ' ')
WHERE short_name IS NULL
  AND code IS NOT NULL
  AND btrim(code) <> '';

CREATE INDEX IF NOT EXISTS idx_gov_exams_short_name_lower
  ON public.gov_exams (lower(short_name));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_gov_exams_short_name_trgm
      ON public.gov_exams USING gin (short_name gin_trgm_ops);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gov_exams_state_code
  ON public.gov_exams (state_code)
  WHERE state_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gov_exams_jurisdiction
  ON public.gov_exams (jurisdiction);

CREATE INDEX IF NOT EXISTS idx_gov_exams_region
  ON public.gov_exams (region)
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gov_exams_verified_at
  ON public.gov_exams (verified_at DESC NULLS LAST);

COMMENT ON COLUMN public.gov_exams.short_name IS
  'Human-friendly short label used for exact search ranking (e.g. SSC CGL).';
COMMENT ON COLUMN public.gov_exams.state_code IS
  'ISO-ish state code for state PSC exams (nullable for central exams).';
COMMENT ON COLUMN public.gov_exams.jurisdiction IS
  'central | state | ut — denormalized from recruiting body when possible.';
COMMENT ON COLUMN public.gov_exams.region IS
  'Optional geographic / zone label for search.';
COMMENT ON COLUMN public.gov_exams.verified_at IS
  'Last time registry metadata was human-verified.';
COMMENT ON COLUMN public.gov_exams.publication_notes IS
  'Internal notes about publication / sourcing; not shown as official content.';

COMMIT;
