-- Government Exam Source Registry + Admin-managed Domain Allowlist.
-- Additive migration; preserves all existing recruiting_bodies and gov_official_sources tables.

BEGIN;

-- ── 1. Admin-managed domain allowlist ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gov_domain_allowlist (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain              text NOT NULL UNIQUE,
  display_name        text NOT NULL,
  recruiting_body_id  uuid REFERENCES public.recruiting_bodies(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  is_official         boolean NOT NULL DEFAULT true,
  allow_subdomains    boolean NOT NULL DEFAULT true,
  allowed_schemes     text[] NOT NULL DEFAULT ARRAY['https']::text[],
  document_types      text[] NOT NULL DEFAULT ARRAY['notification','syllabus','pattern','previous_paper','answer_key','corrigendum']::text[],
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_domain_allowlist_domain
  ON public.gov_domain_allowlist (lower(domain));

CREATE INDEX IF NOT EXISTS idx_gov_domain_allowlist_active
  ON public.gov_domain_allowlist (is_active)
  WHERE is_active = true;

-- Seed canonical official domains
INSERT INTO public.gov_domain_allowlist (domain, display_name, is_official, allow_subdomains, notes)
VALUES
  ('ssc.gov.in', 'Staff Selection Commission (Official)', true, true, 'Central recruiting body for Group B and C staff.'),
  ('ssc.nic.in', 'Staff Selection Commission (Legacy Portal)', true, true, 'Legacy portal archive for past notices.'),
  ('upsc.gov.in', 'Union Public Service Commission (Official)', true, true, 'Central recruiting agency for civil services.'),
  ('documents.upsc.gov.in', 'UPSC Document Repository', true, true, 'Official documents and notification PDF host.'),
  ('static.upsc.gov.in', 'UPSC Static Content Host', true, true, 'Static papers and official answer keys.'),
  ('ibps.in', 'Institute of Banking Personnel Selection (Official)', true, true, 'Banking personnel recruitment body.'),
  ('ibpsonline.ibps.in', 'IBPS Online Application & Paper Host', true, true, 'Official online candidate and paper portal.'),
  ('rrbcdg.gov.in', 'Railway Recruitment Board (Chandigarh / Nodal)', true, true, 'Railway central recruitment portal.'),
  ('indianrailways.gov.in', 'Ministry of Railways (Official)', true, true, 'Central railway government portal.'),
  ('nta.ac.in', 'National Testing Agency (Official)', true, true, 'Premier autonomous testing agency.'),
  ('ncs.gov.in', 'National Career Service (Govt of India)', true, true, 'Official Ministry of Labour employment portal.'),
  ('employmentnews.gov.in', 'Employment News (Govt of India)', true, true, 'Official publication division portal.'),
  ('cdnbbsr.s3waas.gov.in', 'S3WaaS Gov Cloud CDN (Bhubaneswar)', true, true, 'Official Government of India cloud CDN for state/central sites.')
ON CONFLICT (domain) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_official = EXCLUDED.is_official,
  allow_subdomains = EXCLUDED.allow_subdomains,
  updated_at = now();

-- ── 2. Extend gov_official_sources with full registry attributes ───────────────
ALTER TABLE public.gov_official_sources
  ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.gov_exam_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.gov_exam_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paper_id uuid,
  ADD COLUMN IF NOT EXISTS paper_name text,
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS approved_domain text,
  ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'official'
    CHECK (classification IN ('official', 'licensed', 'authorized_upload', 'user_private', 'unsupported')),
  ADD COLUMN IF NOT EXISTS source_state text NOT NULL DEFAULT 'discovered'
    CHECK (source_state IN ('discovered', 'verified', 'ingested', 'staged', 'archived', 'rejected', 'active')),
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS last_collection_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_successful_collection_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_gov_official_sources_classification
  ON public.gov_official_sources (classification);

CREATE INDEX IF NOT EXISTS idx_gov_official_sources_state
  ON public.gov_official_sources (source_state);

CREATE INDEX IF NOT EXISTS idx_gov_official_sources_exam_cycle
  ON public.gov_official_sources (exam_id, cycle_id);

CREATE INDEX IF NOT EXISTS idx_gov_official_sources_hash
  ON public.gov_official_sources (file_hash)
  WHERE file_hash IS NOT NULL;

-- ── 3. Helper functions for Domain & Source Validation ─────────────────────────
CREATE OR REPLACE FUNCTION public.check_is_domain_allowed(p_domain TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := lower(trim(p_domain));
BEGIN
  IF v_normalized IS NULL OR length(v_normalized) < 3 THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.gov_domain_allowlist
     WHERE is_active = true
       AND (
         domain = v_normalized
         OR (allow_subdomains = true AND v_normalized LIKE '%.' || domain)
       )
  );
END;
$$;

-- ── 4. RLS for Domain Allowlist & Extended Sources ────────────────────────────
ALTER TABLE public.gov_domain_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domain_allowlist_select ON public.gov_domain_allowlist;
CREATE POLICY domain_allowlist_select ON public.gov_domain_allowlist
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS domain_allowlist_admin ON public.gov_domain_allowlist;
CREATE POLICY domain_allowlist_admin ON public.gov_domain_allowlist
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Ensure admin has full access to gov_official_sources
DROP POLICY IF EXISTS gov_sources_admin ON public.gov_official_sources;
CREATE POLICY gov_sources_admin ON public.gov_official_sources
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
