-- Persist a refund ledger row even when unspent balance cannot cover clawback,
-- and idempotent per payment_order so refund.created + payment.refunded cannot double-apply.
CREATE OR REPLACE FUNCTION public.apply_razorpay_refund(
  p_order_id uuid,
  p_refund_key text,
  p_credits_granted integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_clawback integer := 0;
  v_key text;
  v_order_key text;
  v_balance integer := 0;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCOUNT_RESTRICTED');
  END IF;
  IF p_order_id IS NULL OR NULLIF(trim(p_refund_key), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_OPERATION');
  END IF;

  -- One refund application per payment order (replay-safe across Razorpay event types).
  v_order_key := left('razorpay_refund_order_' || p_order_id::text, 150);
  INSERT INTO public.idempotency_log(key, metadata, expires_at)
  VALUES (
    v_order_key,
    jsonb_build_object('order_id', p_order_id, 'refund_key', trim(p_refund_key)),
    now() + interval '1 year'
  )
  ON CONFLICT (key) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'clawed', 0);
  END IF;

  -- Keep event-id key for operators correlating Razorpay refund ids (ignore conflicts).
  v_key := left('razorpay_refund_' || trim(p_refund_key), 150);
  INSERT INTO public.idempotency_log(key, metadata, expires_at)
  VALUES (v_key, jsonb_build_object('order_id', p_order_id), now() + interval '1 year')
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_order.user_id
  FOR UPDATE;

  IF FOUND THEN
    v_balance := greatest(coalesce(v_profile.credits, 0), 0);
    IF v_balance >= greatest(coalesce(p_credits_granted, 0), 0) THEN
      v_clawback := greatest(coalesce(p_credits_granted, 0), 0);
    END IF;

    IF v_clawback > 0 THEN
      UPDATE public.profiles
      SET credits = credits - v_clawback, updated_at = now()
      WHERE id = v_profile.id;
      v_balance := v_balance - v_clawback;
    END IF;

    INSERT INTO public.credit_transactions(
      user_id, action, amount, balance_after, description,
      stripe_payment_id, created_at
    )
    VALUES (
      v_profile.id,
      'refund'::public.credit_action,
      -v_clawback,
      v_balance,
      CASE
        WHEN v_clawback > 0 THEN 'Razorpay refund clawback (' || trim(p_refund_key) || ')'
        ELSE 'Razorpay refund processed (' || trim(p_refund_key) || ')'
      END,
      v_order_key,
      now()
    );
  END IF;

  UPDATE public.payment_orders
  SET
    status = 'refunded',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'refund_key', trim(p_refund_key),
      'refunded_at', now(),
      'credits_clawed', v_clawback
    )
  WHERE id = v_order.id;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'clawed', v_clawback);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_razorpay_refund(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_razorpay_refund(uuid, text, integer)
  TO service_role;
