-- Canonical spendable credit authority + structured deduction errors.
-- Additive: does not drop existing deduct_credits / refund_credits.

CREATE OR REPLACE FUNCTION public.is_service_role_request()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  jwt_claims jsonb;
  jwt_role text;
BEGIN
  IF current_user = 'service_role' THEN
    RETURN true;
  END IF;
  IF current_setting('role', true) = 'service_role' THEN
    RETURN true;
  END IF;
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN true;
  END IF;
  BEGIN
    jwt_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    jwt_role := jwt_claims ->> 'role';
    IF jwt_role = 'service_role' THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_service_role_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_service_role_request() TO service_role;

-- Spendable balance = profiles.credits (grants, packs, promo, referral,
-- admin grants, and consumption are applied to this column).
CREATE OR REPLACE FUNCTION public.get_spendable_credits(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits INTEGER;
  v_plan TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OPERATION',
      'error', 'Invalid user'
    );
  END IF;

  IF NOT public.is_service_role_request() THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ACCOUNT_RESTRICTED',
        'error', 'Forbidden'
      );
    END IF;
  END IF;

  SELECT credits, plan_id INTO v_credits, v_plan
    FROM public.profiles
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_RESTRICTED',
      'error', 'Profile not found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance', COALESCE(v_credits, 0),
    'plan_id', v_plan
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_spendable_credits(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_spendable_credits(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.deduct_credits_service(
  p_user_id UUID,
  p_action TEXT,
  p_cost INTEGER,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
  v_existing JSONB;
  v_metadata JSONB;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_RESTRICTED',
      'error', 'Forbidden'
    );
  END IF;
  IF p_user_id IS NULL OR p_action IS NULL OR length(trim(p_action)) = 0
     OR p_cost IS NULL OR p_cost <= 0 OR p_cost > 1000000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OPERATION',
      'error', 'Invalid credit operation'
    );
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
    SELECT response, metadata INTO v_existing, v_metadata
      FROM public.idempotency_log
     WHERE key = p_idempotency_key
       AND (expires_at IS NULL OR expires_at > NOW())
     FOR UPDATE;
    IF v_existing IS NOT NULL THEN
      IF COALESCE(v_metadata->>'user_id', '') <> p_user_id::TEXT
         OR COALESCE(v_metadata->>'action', '') <> trim(p_action)
         OR (p_request_hash IS NOT NULL
             AND COALESCE(v_metadata->>'request_hash', '') <> p_request_hash) THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'INVALID_OPERATION',
          'error', 'Idempotency key conflict'
        );
      END IF;
      RETURN v_existing;
    END IF;
  END IF;

  SELECT credits INTO v_current
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_RESTRICTED',
      'error', 'Profile not found'
    );
  END IF;
  IF v_current < p_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_CREDITS',
      'error', 'Insufficient credits',
      'balance', v_current,
      'cost', p_cost,
      'required', p_cost,
      'shortfall', p_cost - v_current,
      'new_balance', v_current
    );
  END IF;

  v_new_balance := v_current - p_cost;
  UPDATE public.profiles
     SET credits = v_new_balance,
         credits_used_this_month = COALESCE(credits_used_this_month, 0) + p_cost,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.credit_transactions
    (user_id, amount, action, session_id, balance_after, description, created_at)
  VALUES
    (p_user_id, -p_cost, 'usage'::public.credit_action, p_session_id,
     v_new_balance, trim(p_action), NOW())
  RETURNING id INTO v_transaction_id;

  v_existing := jsonb_build_object(
    'success', true,
    'code', 'OK',
    'new_balance', v_new_balance,
    'balance', v_new_balance,
    'cost', p_cost,
    'transaction_id', v_transaction_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_log
      (key, response, metadata, expires_at)
    VALUES
      (p_idempotency_key, v_existing,
       jsonb_build_object(
         'user_id', p_user_id::TEXT,
         'action', trim(p_action),
         'request_hash', p_request_hash
       ),
       NOW() + INTERVAL '24 hours')
    ON CONFLICT (key) DO UPDATE
      SET response = EXCLUDED.response,
          metadata = EXCLUDED.metadata,
          expires_at = EXCLUDED.expires_at;
  END IF;

  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_credits_service(UUID, TEXT, INTEGER, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_service(UUID, TEXT, INTEGER, UUID, TEXT, TEXT)
  TO service_role;

-- Harden refund_credits role detection (same service-role helper).
CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_cost INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
  MAX_REFUND CONSTANT INTEGER := 25;
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

  IF p_cost <= 0 OR p_cost > MAX_REFUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_OPERATION',
      'error', 'Invalid refund amount'
    );
  END IF;

  UPDATE public.profiles
     SET credits = credits + p_cost,
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
    p_cost,
    v_new_balance,
    COALESCE(NULLIF(trim(p_reason), ''), 'Credit refund'),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', 'OK',
    'new_balance', v_new_balance,
    'balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) TO service_role;
