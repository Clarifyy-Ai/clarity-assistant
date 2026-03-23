-- ─────────────────────────────────────────────────────────────────────────────
-- refund_credits RPC
-- Refunds credits to the authenticated user's profile when an AI request fails.
-- Security: p_cost is capped at MAX_REFUND_AMOUNT to prevent credit minting.
-- The maximum refundable amount equals the highest single-action credit cost.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refund_credits(
  p_cost INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID    := auth.uid();
  v_new_balance  INTEGER;
  MAX_REFUND     CONSTANT INTEGER := 5;   -- max credits refundable in one call
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Clamp refund to a safe maximum to prevent credit minting
  IF p_cost <= 0 OR p_cost > MAX_REFUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
  END IF;

  UPDATE profiles
    SET credits    = credits + p_cost,
        updated_at = NOW()
    WHERE id = v_user_id
    RETURNING credits INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_credits(INTEGER) TO authenticated;
