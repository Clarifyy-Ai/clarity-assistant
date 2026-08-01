-- Per-exam question-bank readiness for full-pattern simulations.
-- Counts public+verified questions by legacy_exam_type vs approved pattern total.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_gov_bank_readiness_status(
  p_approved_count bigint,
  p_required int
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_approved_count, 0) <= 0 THEN 'empty'
    WHEN COALESCE(p_required, 0) <= 0 THEN 'partial'
    WHEN p_approved_count >= p_required THEN 'ready'
    ELSE 'partial'
  END;
$$;

COMMENT ON FUNCTION public.compute_gov_bank_readiness_status(bigint, int) IS
  'Maps approved bank size vs pattern total_questions to ready|partial|empty.';

CREATE OR REPLACE FUNCTION public.get_gov_exam_bank_readiness(
  p_exam_id uuid DEFAULT NULL
)
RETURNS TABLE (
  exam_id uuid,
  exam_code text,
  exam_name text,
  family text,
  legacy_exam_type text,
  stage_id uuid,
  stage_code text,
  pattern_version_id uuid,
  pattern_version text,
  required_questions int,
  approved_public_count bigint,
  public_count bigint,
  status text,
  full_simulation_available boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH primary_stage AS (
    SELECT DISTINCT ON (e.id)
      e.id AS exam_id,
      e.code AS exam_code,
      e.name AS exam_name,
      e.family,
      e.legacy_exam_type,
      st.id AS stage_id,
      st.code AS stage_code
    FROM public.gov_exams e
    JOIN public.gov_exam_stages st ON st.exam_id = e.id
    WHERE (p_exam_id IS NULL OR e.id = p_exam_id)
    ORDER BY e.id, st.sort_order ASC, st.code ASC
  ),
  approved_pattern AS (
    SELECT DISTINCT ON (ps.exam_id)
      ps.exam_id,
      ps.exam_code,
      ps.exam_name,
      ps.family,
      ps.legacy_exam_type,
      ps.stage_id,
      ps.stage_code,
      pv.id AS pattern_version_id,
      pv.version AS pattern_version,
      pv.total_questions AS required_questions
    FROM primary_stage ps
    LEFT JOIN public.gov_exam_pattern_versions pv
      ON pv.exam_id = ps.exam_id
      AND pv.stage_id = ps.stage_id
      AND pv.review_state = 'approved'
    ORDER BY ps.exam_id, pv.effective_date DESC NULLS LAST, pv.created_at DESC NULLS LAST
  ),
  bank AS (
    SELECT
      ap.exam_id,
      COUNT(q.id) FILTER (
        WHERE q.is_public IS TRUE AND q.is_verified IS TRUE
      ) AS approved_public_count,
      COUNT(q.id) FILTER (WHERE q.is_public IS TRUE) AS public_count
    FROM approved_pattern ap
    LEFT JOIN public.questions q
      ON ap.legacy_exam_type IS NOT NULL
      AND q.exam_type = ap.legacy_exam_type
    GROUP BY ap.exam_id
  )
  SELECT
    ap.exam_id,
    ap.exam_code,
    ap.exam_name,
    ap.family,
    ap.legacy_exam_type,
    ap.stage_id,
    ap.stage_code,
    ap.pattern_version_id,
    ap.pattern_version,
    COALESCE(ap.required_questions, 0)::int AS required_questions,
    COALESCE(b.approved_public_count, 0)::bigint AS approved_public_count,
    COALESCE(b.public_count, 0)::bigint AS public_count,
    public.compute_gov_bank_readiness_status(
      COALESCE(b.approved_public_count, 0),
      COALESCE(ap.required_questions, 0)
    ) AS status,
    (
      COALESCE(ap.required_questions, 0) > 0
      AND COALESCE(b.approved_public_count, 0) >= ap.required_questions
    ) AS full_simulation_available
  FROM approved_pattern ap
  LEFT JOIN bank b ON b.exam_id = ap.exam_id
  ORDER BY ap.exam_code;
$$;

COMMENT ON FUNCTION public.get_gov_exam_bank_readiness(uuid) IS
  'Per-exam public+verified bank counts vs approved pattern total; status ready|partial|empty.';

REVOKE ALL ON FUNCTION public.compute_gov_bank_readiness_status(bigint, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_gov_bank_readiness_status(bigint, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_gov_bank_readiness_status(bigint, int) TO service_role;

REVOKE ALL ON FUNCTION public.get_gov_exam_bank_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gov_exam_bank_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gov_exam_bank_readiness(uuid) TO service_role;

-- Convenience view for admin SQL / dashboards (same rows as RPC with null exam filter).
CREATE OR REPLACE VIEW public.gov_exam_bank_readiness
WITH (security_invoker = true)
AS
SELECT * FROM public.get_gov_exam_bank_readiness(NULL);

COMMENT ON VIEW public.gov_exam_bank_readiness IS
  'Computed bank readiness matrix; prefer get_gov_exam_bank_readiness() RPC from clients.';

GRANT SELECT ON public.gov_exam_bank_readiness TO authenticated;
GRANT SELECT ON public.gov_exam_bank_readiness TO service_role;

COMMIT;
