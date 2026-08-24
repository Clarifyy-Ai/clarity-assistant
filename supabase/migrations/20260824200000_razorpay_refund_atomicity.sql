-- Make Razorpay refund handling atomic and retry-safe.
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
BEGIN
  IF NOT public.is_service_role_request() THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCOUNT_RESTRICTED');
  END IF;
  IF p_order_id IS NULL OR NULLIF(trim(p_refund_key), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_OPERATION');
  END IF;

  v_key := left('razorpay_refund_' || trim(p_refund_key), 150);
  INSERT INTO public.idempotency_log(key, metadata, expires_at)
  VALUES (v_key, jsonb_build_object('order_id', p_order_id), now() + interval '1 year')
  ON CONFLICT (key) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'clawed', 0);
  END IF;

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

  IF FOUND AND greatest(coalesce(v_profile.credits, 0), 0) >= greatest(coalesce(p_credits_granted, 0), 0) THEN
    v_clawback := greatest(coalesce(p_credits_granted, 0), 0);
    IF v_clawback > 0 THEN
      UPDATE public.profiles
      SET credits = credits - v_clawback, updated_at = now()
      WHERE id = v_profile.id;

      INSERT INTO public.credit_transactions(
        user_id, action, amount, balance_after, description,
        stripe_payment_id, created_at
      )
      VALUES (
        v_profile.id, 'refund', -v_clawback,
        v_profile.credits - v_clawback,
        'Razorpay refund clawback (' || trim(p_refund_key) || ')',
        v_key, now()
      );
    END IF;
  END IF;

  UPDATE public.payment_orders
  SET status = 'refunded'
  WHERE id = v_order.id;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'clawed', v_clawback);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_razorpay_refund(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_razorpay_refund(uuid, text, integer)
  TO service_role;
