-- Idempotent referral conversion: skip duplicate conversion_recorded events on webhook retry.

CREATE OR REPLACE FUNCTION public.mark_referral_converted(
  p_referred_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.referrals%ROWTYPE;
  v_new_status public.referral_status;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RAISE EXCEPTION 'mark_referral_converted forbidden';
  END IF;

  IF p_referred_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_user');
  END IF;

  SELECT * INTO v_row
  FROM public.referrals
  WHERE referred_id = p_referred_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.converted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'attribution_id', v_row.id,
      'status', v_row.status,
      'converted_at', v_row.converted_at,
      'credits_granted', false,
      'already_converted', true
    );
  END IF;

  IF v_row.status = 'rewarded' THEN
    v_new_status := 'rewarded';
  ELSE
    v_new_status := 'converted';
  END IF;

  UPDATE public.referrals
  SET
    converted_at = now(),
    status = v_new_status
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO public.referral_events (
    attribution_id, event_type, event_status, metadata
  ) VALUES (
    v_row.id,
    'conversion_recorded',
    'succeeded',
    jsonb_build_object(
      'referred_id', p_referred_user_id,
      'status', v_row.status,
      'credits_granted', false
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'attribution_id', v_row.id,
    'status', v_row.status,
    'converted_at', v_row.converted_at,
    'credits_granted', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_referral_converted(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_referral_converted(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.mark_referral_converted(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_referral_converted(UUID) TO service_role;
