-- Atomic service-role credit operations for Edge Functions.
-- This is additive; do not edit or replay earlier migrations.

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
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;
  IF p_user_id IS NULL OR p_action IS NULL OR length(trim(p_action)) = 0
     OR p_cost IS NULL OR p_cost <= 0 OR p_cost > 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credit operation');
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
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key conflict');
      END IF;
      RETURN v_existing;
    END IF;
  END IF;

  SELECT credits INTO v_current
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  IF v_current < p_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits',
      'new_balance', v_current);
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
    'new_balance', v_new_balance,
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
