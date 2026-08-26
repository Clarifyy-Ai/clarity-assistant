-- Wave 1 billing-credits: idempotent Razorpay ledger grants (no double credit).

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_payment_id_unique
  ON public.credit_transactions (stripe_payment_id)
  WHERE stripe_payment_id IS NOT NULL AND btrim(stripe_payment_id) <> '';

CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id uuid,
  p_amount integer,
  p_action credit_action DEFAULT 'purchase'::credit_action,
  p_description text DEFAULT NULL,
  p_payment_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INTEGER;
  v_payment_key TEXT;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RAISE EXCEPTION 'add_credits forbidden';
  END IF;

  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid add_credits arguments';
  END IF;

  v_payment_key := NULLIF(btrim(p_payment_id), '');

  IF v_payment_key IS NOT NULL THEN
    SELECT credits INTO v_new
      FROM public.profiles
     WHERE id = p_user_id;

    IF EXISTS (
      SELECT 1
        FROM public.credit_transactions
       WHERE stripe_payment_id = v_payment_key
    ) THEN
      RETURN COALESCE(v_new, 0);
    END IF;
  END IF;

  UPDATE public.profiles
     SET credits = credits + p_amount,
         updated_at = NOW()
   WHERE id = p_user_id
  RETURNING credits INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for add_credits';
  END IF;

  BEGIN
    INSERT INTO public.credit_transactions (
      user_id, action, amount, balance_after, description, stripe_payment_id
    ) VALUES (
      p_user_id, p_action, p_amount, v_new, p_description, v_payment_key
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT credits INTO v_new
        FROM public.profiles
       WHERE id = p_user_id;
      RETURN COALESCE(v_new, 0);
  END;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.add_credits(uuid, integer, credit_action, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, credit_action, text, text)
  TO service_role;
