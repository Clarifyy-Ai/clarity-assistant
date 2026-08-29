-- Restore refund_credits(UUID, INTEGER, TEXT, UUID) dropped by 20260826120100.
-- Edge functions pass p_source_transaction_id; the 3-arg variant caused silent refund failures.

DROP FUNCTION IF EXISTS public.refund_credits(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_cost INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_source_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
  v_amount INTEGER;
  v_txn_amount INTEGER;
  MAX_REFUND_SAFETY CONSTANT INTEGER := 100;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_RESTRICTED',
      'error', 'Forbidden'
    );
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OPERATION',
      'error', 'Missing user id'
    );
  END IF;

  IF p_source_transaction_id IS NOT NULL THEN
    SELECT ABS(amount) INTO v_txn_amount
      FROM public.credit_transactions
     WHERE id = p_source_transaction_id
       AND user_id = p_user_id
       AND action = 'usage';

    IF v_txn_amount IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'INVALID_OPERATION',
        'error', 'Source usage transaction not found',
        'safety_cap', MAX_REFUND_SAFETY
      );
    END IF;
    v_amount := v_txn_amount;
  ELSE
    v_amount := p_cost;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > MAX_REFUND_SAFETY THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OPERATION',
      'error', 'Invalid refund amount',
      'safety_cap', MAX_REFUND_SAFETY,
      'requested', v_amount
    );
  END IF;

  UPDATE public.profiles
     SET credits = credits + v_amount,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING credits INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_RESTRICTED',
      'error', 'Profile not found'
    );
  END IF;

  INSERT INTO public.credit_transactions (
    user_id,
    action,
    amount,
    balance_after,
    description,
    created_at
  ) VALUES (
    p_user_id,
    'refund'::public.credit_action,
    v_amount,
    v_new_balance,
    COALESCE(NULLIF(trim(p_reason), ''), 'Credit refund'),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', 'OK',
    'new_balance', v_new_balance,
    'balance', v_new_balance,
    'refunded', v_amount,
    'safety_cap', MAX_REFUND_SAFETY
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT, UUID) TO service_role;
