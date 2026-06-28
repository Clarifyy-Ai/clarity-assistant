-- Razorpay payments, admin promo codes, referral rewards, signup dedup.

-- ── Signup dedup ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_normalized TEXT,
  ADD COLUMN IF NOT EXISTS pending_promo_code TEXT,
  ADD COLUMN IF NOT EXISTS auto_deduct_credits BOOLEAN NOT NULL DEFAULT true;

UPDATE public.profiles
SET email_normalized = lower(trim(email))
WHERE email_normalized IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_normalized_unique
  ON public.profiles (email_normalized)
  WHERE email_normalized IS NOT NULL AND email_normalized <> '';

-- ── Admin billing settings (singleton) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id                        SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  referral_discount_percent INTEGER NOT NULL DEFAULT 50 CHECK (referral_discount_percent BETWEEN 0 AND 100),
  referrer_credit_reward    INTEGER NOT NULL DEFAULT 25 CHECK (referrer_credit_reward >= 0),
  referee_credit_reward     INTEGER NOT NULL DEFAULT 25 CHECK (referee_credit_reward >= 0),
  auto_deduct_credits       BOOLEAN NOT NULL DEFAULT true,
  razorpay_enabled          BOOLEAN NOT NULL DEFAULT true,
  pro_monthly_inr_paise     INTEGER NOT NULL DEFAULT 249900,
  enterprise_monthly_inr_paise INTEGER NOT NULL DEFAULT 679900,
  credits_50_inr_paise      INTEGER NOT NULL DEFAULT 69900,
  credits_150_inr_paise     INTEGER NOT NULL DEFAULT 189900,
  credits_500_inr_paise     INTEGER NOT NULL DEFAULT 599900,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.billing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Promo codes (admin-managed) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  description       TEXT,
  discount_percent  INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  bonus_credits     INTEGER NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  max_redemptions   INTEGER,
  redemption_count  INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  applies_to        TEXT NOT NULL DEFAULT 'all'
    CHECK (applies_to IN ('all', 'subscription', 'credits')),
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until       TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_upper_idx
  ON public.promo_codes (upper(trim(code)));

-- ── Payment orders (Razorpay + audit trail) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay', 'stripe')),
  provider_order_id   TEXT,
  provider_payment_id TEXT,
  product_type        TEXT NOT NULL,
  amount_paise        INTEGER NOT NULL CHECK (amount_paise > 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  credits_granted     INTEGER NOT NULL DEFAULT 0,
  plan_id             TEXT,
  promo_code_id       UUID REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  promo_code          TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at             TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_order_idx
  ON public.payment_orders (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx
  ON public.payment_orders (user_id, created_at DESC);

-- ── Referral code on signup + email normalize ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_code TEXT;
  v_email_norm TEXT;
BEGIN
  v_email_norm := lower(trim(NEW.email));
  v_ref_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.profiles (
    id, email, email_normalized, full_name, avatar_url, credits,
    referral_code, auto_deduct_credits, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_email_norm,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    50,
    v_ref_code,
    true,
    NOW(),
    NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan_id, status, monthly_credits)
  VALUES (NEW.id, 'free', 'active', 50)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── Record referral + award credits (service role / edge only) ───────────────
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
  IF length(v_code) < 6 THEN
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

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_unique_idx
  ON public.promo_codes (upper(trim(code)));

GRANT EXECUTE ON FUNCTION public.record_referral_reward(UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_referral_reward(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_read ON public.billing_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS promo_codes_read_active ON public.promo_codes;
CREATE POLICY promo_codes_read_active ON public.promo_codes
  FOR SELECT TO authenticated
  USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));

DROP POLICY IF EXISTS payment_orders_own_read ON public.payment_orders;
CREATE POLICY payment_orders_own_read ON public.payment_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admin manage promo codes & billing settings
DROP POLICY IF EXISTS promo_codes_admin_all ON public.promo_codes;
CREATE POLICY promo_codes_admin_all ON public.promo_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS billing_settings_admin_write ON public.billing_settings;
CREATE POLICY billing_settings_admin_write ON public.billing_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
