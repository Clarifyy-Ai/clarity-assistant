-- Public read surface for active promo codes (marketing pages).
-- Returns safe fields only; full table remains admin/edge-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_promo_offers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code', upper(trim(code)),
        'discount_percent', COALESCE(discount_percent, 0),
        'bonus_credits', COALESCE(bonus_credits, 0),
        'valid_until', valid_until,
        'description', description
      )
      ORDER BY created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.promo_codes
  WHERE is_active = true
    AND (valid_until IS NULL OR valid_until > now())
    AND (valid_from IS NULL OR valid_from <= now())
    AND (max_redemptions IS NULL OR COALESCE(redemption_count, 0) < max_redemptions)
    AND length(trim(code)) >= 4;
$$;

REVOKE ALL ON FUNCTION public.get_public_promo_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_promo_offers() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_promo_offers IS
  'Marketing/pricing pages: list active promo codes without exposing redemption stats or admin fields.';

COMMIT;
