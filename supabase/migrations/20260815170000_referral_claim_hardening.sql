-- Referral claim hardening:
-- 1) Authenticated users can mint their own referral_code (column is RLS-pinned).
-- 2) Client INSERT/UPDATE on referrals is revoked — awards go through record_referral_reward (service_role).
-- 3) Reject referral codes that are not alphanumeric 6–16.

CREATE OR REPLACE FUNCTION public.ensure_my_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_attempt int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT upper(btrim(referral_code)) INTO v_code
  FROM public.profiles
  WHERE id = v_uid;

  IF v_code IS NOT NULL AND v_code ~ '^[A-Z0-9]{6,16}$' THEN
    RETURN v_code;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 8 THEN
      RAISE EXCEPTION 'could not allocate referral code';
    END IF;

    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    BEGIN
      UPDATE public.profiles
      SET referral_code = v_code, updated_at = now()
      WHERE id = v_uid
        AND (
          referral_code IS NULL
          OR btrim(referral_code) = ''
          OR upper(btrim(referral_code)) !~ '^[A-Z0-9]{6,16}$'
        );

      IF FOUND THEN
        RETURN v_code;
      END IF;

      SELECT upper(btrim(referral_code)) INTO v_code
      FROM public.profiles
      WHERE id = v_uid;

      IF v_code IS NOT NULL AND v_code ~ '^[A-Z0-9]{6,16}$' THEN
        RETURN v_code;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_referral_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_my_referral_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_referral_code() TO authenticated;

DROP POLICY IF EXISTS referrals_insert ON public.referrals;
DROP POLICY IF EXISTS referrals_update ON public.referrals;

REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_id_key
  ON public.referrals (referred_id);

CREATE OR REPLACE FUNCTION public.record_referral_reward(
  p_referred_id UUID,
  p_referral_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code TEXT;
  v_referrer_id UUID;
  v_settings RECORD;
  v_referee_reward INTEGER;
  v_referrer_reward INTEGER;
  v_discount INTEGER;
  v_promo TEXT;
  v_existing UUID;
BEGIN
  v_code := upper(trim(p_referral_code));
  IF v_code IS NULL OR v_code !~ '^[A-Z0-9]{6,16}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE upper(referral_code) = v_code
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'code_not_found');
  END IF;

  IF v_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  SELECT referred_id INTO v_existing
  FROM public.referrals
  WHERE referred_id = p_referred_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_recorded');
  END IF;

  SELECT * INTO v_settings FROM public.billing_settings WHERE id = 1;
  v_referee_reward := COALESCE(v_settings.referee_credit_reward, 25);
  v_referrer_reward := COALESCE(v_settings.referrer_credit_reward, 25);
  v_discount := COALESCE(v_settings.referral_discount_percent, 50);
  v_promo := 'REF' || upper(substr(replace(p_referred_id::text, '-', ''), 1, 8));

  INSERT INTO public.referrals (
    referrer_id, referred_id, referred_email, credits_awarded, status, signed_up_at
  )
  SELECT
    v_referrer_id,
    p_referred_id,
    COALESCE(p.email, ''),
    v_referrer_reward,
    'signed_up',
    NOW()
  FROM public.profiles p
  WHERE p.id = p_referred_id
  ON CONFLICT (referred_id) DO NOTHING;

  UPDATE public.profiles
  SET
    referred_by = v_referrer_id::text,
    pending_promo_code = v_promo,
    updated_at = NOW()
  WHERE id = p_referred_id;

  INSERT INTO public.promo_codes (
    code, description, discount_percent, max_redemptions, applies_to, is_active
  )
  SELECT
    v_promo,
    'Referral welcome — ' || v_discount || '% off first purchase',
    v_discount,
    1,
    'all',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.promo_codes WHERE upper(trim(code)) = v_promo
  );

  PERFORM public.add_credits(
    p_referred_id, v_referee_reward, 'referral_reward'::credit_action,
    'Referral signup bonus', NULL
  );

  PERFORM public.add_credits(
    v_referrer_id, v_referrer_reward, 'referral_reward'::credit_action,
    'Referral reward — friend signed up', NULL
  );

  UPDATE public.referrals
  SET credits_awarded = v_referrer_reward, rewarded_at = NOW(), status = 'rewarded'
  WHERE referred_id = p_referred_id AND referrer_id = v_referrer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'referrer_id', v_referrer_id,
    'referee_credits', v_referee_reward,
    'referrer_credits', v_referrer_reward,
    'promo_code', v_promo,
    'discount_percent', v_discount
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_referral_reward(UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_referral_reward(UUID, TEXT) FROM PUBLIC, anon, authenticated;
