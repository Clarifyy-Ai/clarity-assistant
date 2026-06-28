-- refund_credits: service_role-only RPC with explicit p_user_id (edge functions pass user id).
-- Replaces auth.uid()-based (integer) overload that blocked refunds from service clients.

DROP FUNCTION IF EXISTS public.refund_credits(integer);

CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id uuid,
  p_cost integer,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance INTEGER;
  MAX_REFUND CONSTANT INTEGER := 25;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing user id');
  END IF;

  IF p_cost <= 0 OR p_cost > MAX_REFUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
  END IF;

  UPDATE public.profiles
     SET credits = credits + p_cost,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING credits INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
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

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) TO service_role;
