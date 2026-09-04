-- Phase B: Referral programme lifecycle
-- Additive: programmes / events / rewards + dashboard / conversion RPCs.
-- Evolves record_referral_reward; keeps ensure_my_referral_code + get_my_referrals.

-- ── 1. referral_programmes ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_programmes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  version                     TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  eligibility_rules           JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualifying_event            TEXT NOT NULL DEFAULT 'authenticated_claim',
  referrer_credit_reward      INTEGER NOT NULL DEFAULT 25 CHECK (referrer_credit_reward >= 0),
  referee_credit_reward       INTEGER NOT NULL DEFAULT 25 CHECK (referee_credit_reward >= 0),
  referral_discount_percent   NUMERIC NOT NULL DEFAULT 50
    CHECK (referral_discount_percent >= 0 AND referral_discount_percent <= 100),
  maximum_rewards             INTEGER NULL CHECK (maximum_rewards IS NULL OR maximum_rewards >= 0),
  terms_url                   TEXT NULL,
  start_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at                      TIMESTAMPTZ NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_programmes_version_key UNIQUE (version)
);

CREATE INDEX IF NOT EXISTS referral_programmes_status_idx
  ON public.referral_programmes (status);

DROP TRIGGER IF EXISTS referral_programmes_set_updated_at ON public.referral_programmes;
CREATE TRIGGER referral_programmes_set_updated_at
  BEFORE UPDATE ON public.referral_programmes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.referral_programmes (
  name,
  version,
  status,
  eligibility_rules,
  qualifying_event,
  referrer_credit_reward,
  referee_credit_reward,
  referral_discount_percent,
  maximum_rewards,
  terms_url,
  start_at,
  end_at
)
SELECT
  'Career Pilot Referral v1',
  'referral-v1',
  'active',
  '{}'::jsonb,
  'authenticated_claim',
  COALESCE(bs.referrer_credit_reward, 25),
  COALESCE(bs.referee_credit_reward, 25),
  COALESCE(bs.referral_discount_percent, 50)::numeric,
  NULL,
  NULL,
  now(),
  NULL
FROM (SELECT 1) AS _
LEFT JOIN public.billing_settings bs ON bs.id = 1
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.referral_programmes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referral_programmes FROM PUBLIC;
REVOKE ALL ON TABLE public.referral_programmes FROM anon;
REVOKE ALL ON TABLE public.referral_programmes FROM authenticated;
GRANT ALL ON TABLE public.referral_programmes TO service_role;
GRANT ALL ON TABLE public.referral_programmes TO postgres;
-- Active programme readable by authenticated (dashboard also SECURITY DEFINER).
GRANT SELECT ON TABLE public.referral_programmes TO authenticated;

DROP POLICY IF EXISTS referral_programmes_select_active ON public.referral_programmes;
CREATE POLICY referral_programmes_select_active
  ON public.referral_programmes
  FOR SELECT
  TO authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS referral_programmes_admin_all ON public.referral_programmes;
CREATE POLICY referral_programmes_admin_all
  ON public.referral_programmes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ensure legacy column still exists for referrer totals.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_credits_earned INTEGER NOT NULL DEFAULT 0;

-- ── 2. Extend referrals ──────────────────────────────────────────────────────

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS programme_id uuid REFERENCES public.referral_programmes(id),
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS attribution_source text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

CREATE INDEX IF NOT EXISTS referrals_programme_id_idx
  ON public.referrals (programme_id);

UPDATE public.referrals r
SET
  programme_id = COALESCE(
    r.programme_id,
    (SELECT p.id FROM public.referral_programmes p WHERE p.version = 'referral-v1' LIMIT 1)
  ),
  policy_version = COALESCE(r.policy_version, 'referral-v1')
WHERE r.programme_id IS NULL OR r.policy_version IS NULL;

GRANT SELECT (
  id, referrer_id, referred_id, status, credits_awarded,
  signed_up_at, converted_at, rewarded_at, created_at,
  programme_id, policy_version, attribution_source
) ON public.referrals TO authenticated;

-- ── 3. referral_events (service_role only) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id    UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  event_status      TEXT NOT NULL,
  operation_id      TEXT NULL,
  source_record_id  TEXT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS referral_events_attribution_id_idx
  ON public.referral_events (attribution_id);

CREATE INDEX IF NOT EXISTS referral_events_occurred_at_idx
  ON public.referral_events (occurred_at DESC);

ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referral_events FROM PUBLIC;
REVOKE ALL ON TABLE public.referral_events FROM anon;
REVOKE ALL ON TABLE public.referral_events FROM authenticated;
GRANT ALL ON TABLE public.referral_events TO service_role;
GRANT ALL ON TABLE public.referral_events TO postgres;
-- No client policies: service_role bypasses RLS.

-- ── 4. referral_rewards (service_role only) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id        UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  beneficiary_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_type           TEXT NOT NULL,
  reward_amount         INTEGER NOT NULL CHECK (reward_amount >= 0),
  reward_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (reward_status IN ('pending', 'granted', 'rejected')),
  idempotency_key       TEXT NOT NULL,
  credit_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  description           TEXT NULL,
  pending_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_at            TIMESTAMPTZ NULL,
  rejected_at           TIMESTAMPTZ NULL,
  rejection_reason      TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_rewards_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS referral_rewards_attribution_id_idx
  ON public.referral_rewards (attribution_id);

CREATE INDEX IF NOT EXISTS referral_rewards_beneficiary_idx
  ON public.referral_rewards (beneficiary_user_id);

DROP TRIGGER IF EXISTS referral_rewards_set_updated_at ON public.referral_rewards;
CREATE TRIGGER referral_rewards_set_updated_at
  BEFORE UPDATE ON public.referral_rewards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referral_rewards FROM PUBLIC;
REVOKE ALL ON TABLE public.referral_rewards FROM anon;
REVOKE ALL ON TABLE public.referral_rewards FROM authenticated;
GRANT ALL ON TABLE public.referral_rewards TO service_role;
GRANT ALL ON TABLE public.referral_rewards TO postgres;
-- No client policies: service_role bypasses RLS.

-- ── 5. REPLACE record_referral_reward ────────────────────────────────────────
-- add_credits signature (wave1):
--   add_credits(p_user_id uuid, p_amount integer, p_action credit_action,
--               p_description text DEFAULT NULL, p_payment_id text DEFAULT NULL)
-- Idempotency: pass stable key as p_payment_id (unique on credit_transactions.stripe_payment_id)
-- and include the same key in p_description.

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
  v_programme RECORD;
  v_referee_reward INTEGER;
  v_referrer_reward INTEGER;
  v_discount NUMERIC;
  v_promo TEXT;
  v_attribution_id UUID;
  v_inserted UUID;
  v_referrer_key TEXT;
  v_referee_key TEXT;
  v_referrer_txn UUID;
  v_referee_txn UUID;
  v_rewarded_count INTEGER;
  v_desc_referrer TEXT;
  v_desc_referee TEXT;
BEGIN
  IF NOT public.is_service_role_request() THEN
    RAISE EXCEPTION 'record_referral_reward forbidden';
  END IF;

  v_code := upper(trim(COALESCE(p_referral_code, '')));
  IF v_code IS NULL OR v_code = '' OR v_code !~ '^[A-Z0-9]{6,16}$' THEN
    INSERT INTO public.referral_events (
      attribution_id, event_type, event_status, metadata
    ) VALUES (
      NULL, 'claim_reject', 'rejected',
      jsonb_build_object('reason', 'invalid_code', 'referred_id', p_referred_id)
    );
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_code',
      'referee_credits', 0,
      'referrer_credits', 0,
      'promo_code', NULL,
      'attribution_id', NULL
    );
  END IF;

  SELECT *
    INTO v_programme
    FROM public.referral_programmes
   WHERE status = 'active'
     AND start_at <= now()
     AND (end_at IS NULL OR end_at > now())
   ORDER BY start_at DESC
   LIMIT 1;

  IF v_programme.id IS NULL THEN
    INSERT INTO public.referral_events (
      attribution_id, event_type, event_status, metadata
    ) VALUES (
      NULL, 'claim_reject', 'rejected',
      jsonb_build_object('reason', 'programme_disabled', 'referred_id', p_referred_id, 'code', v_code)
    );
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'programme_disabled',
      'referee_credits', 0,
      'referrer_credits', 0,
      'promo_code', NULL,
      'attribution_id', NULL
    );
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE upper(referral_code) = v_code
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    INSERT INTO public.referral_events (
      attribution_id, event_type, event_status, metadata
    ) VALUES (
      NULL, 'claim_reject', 'rejected',
      jsonb_build_object('reason', 'code_not_found', 'referred_id', p_referred_id, 'code', v_code)
    );
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'code_not_found',
      'referee_credits', 0,
      'referrer_credits', 0,
      'promo_code', NULL,
      'attribution_id', NULL
    );
  END IF;

  IF v_referrer_id = p_referred_id THEN
    INSERT INTO public.referral_events (
      attribution_id, event_type, event_status, metadata
    ) VALUES (
      NULL, 'claim_reject', 'rejected',
      jsonb_build_object('reason', 'self_referral', 'referred_id', p_referred_id, 'code', v_code)
    );
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'self_referral',
      'referee_credits', 0,
      'referrer_credits', 0,
      'promo_code', NULL,
      'attribution_id', NULL
    );
  END IF;

  SELECT id INTO v_attribution_id
  FROM public.referrals
  WHERE referred_id = p_referred_id
  LIMIT 1;

  IF v_attribution_id IS NOT NULL THEN
    INSERT INTO public.referral_events (
      attribution_id, event_type, event_status, metadata
    ) VALUES (
      v_attribution_id, 'claim_reject', 'rejected',
      jsonb_build_object('reason', 'already_recorded', 'referred_id', p_referred_id)
    );
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'already_recorded',
      'referee_credits', 0,
      'referrer_credits', 0,
      'promo_code', NULL,
      'attribution_id', v_attribution_id
    );
  END IF;

  IF v_programme.maximum_rewards IS NOT NULL THEN
    SELECT count(*)::integer INTO v_rewarded_count
    FROM public.referrals
    WHERE referrer_id = v_referrer_id
      AND programme_id = v_programme.id
      AND status IN ('rewarded', 'converted');

    IF v_rewarded_count >= v_programme.maximum_rewards THEN
      INSERT INTO public.referral_events (
        attribution_id, event_type, event_status, metadata
      ) VALUES (
        NULL, 'claim_reject', 'rejected',
        jsonb_build_object(
          'reason', 'programme_disabled',
          'detail', 'maximum_rewards_reached',
          'referred_id', p_referred_id,
          'referrer_id', v_referrer_id
        )
      );
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'programme_disabled',
        'referee_credits', 0,
        'referrer_credits', 0,
        'promo_code', NULL,
        'attribution_id', NULL
      );
    END IF;
  END IF;

  v_referee_reward := COALESCE(v_programme.referee_credit_reward, 25);
  v_referrer_reward := COALESCE(v_programme.referrer_credit_reward, 25);
  v_discount := COALESCE(v_programme.referral_discount_percent, 50);
  v_promo := 'REF' || upper(substr(replace(p_referred_id::text, '-', ''), 1, 8));

  INSERT INTO public.referrals (
    referrer_id,
    referred_id,
    referred_email,
    credits_awarded,
    status,
    signed_up_at,
    programme_id,
    policy_version,
    attribution_source
  )
  SELECT
    v_referrer_id,
    p_referred_id,
    COALESCE(p.email, ''),
    v_referrer_reward,
    'signed_up',
    now(),
    v_programme.id,
    v_programme.version,
    'authenticated_claim'
  FROM public.profiles p
  WHERE p.id = p_referred_id
  ON CONFLICT (referred_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    SELECT id INTO v_attribution_id
    FROM public.referrals
    WHERE referred_id = p_referred_id
    LIMIT 1;

    INSERT INTO public.referral_events (
      attribution_id, event_type, event_status, metadata
    ) VALUES (
      v_attribution_id, 'claim_reject', 'rejected',
      jsonb_build_object('reason', 'already_recorded', 'referred_id', p_referred_id)
    );

    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'already_recorded',
      'referee_credits', 0,
      'referrer_credits', 0,
      'promo_code', NULL,
      'attribution_id', v_attribution_id
    );
  END IF;

  v_attribution_id := v_inserted;
  v_referrer_key := 'referral:' || v_attribution_id::text || ':referrer';
  v_referee_key := 'referral:' || v_attribution_id::text || ':referee';
  v_desc_referrer := 'Referral reward — friend signed up [' || v_referrer_key || ']';
  v_desc_referee := 'Referral signup bonus [' || v_referee_key || ']';

  INSERT INTO public.referral_rewards (
    attribution_id, beneficiary_user_id, reward_type, reward_amount,
    reward_status, idempotency_key, description, pending_at
  ) VALUES (
    v_attribution_id, v_referrer_id, 'referrer_credit', v_referrer_reward,
    'pending', v_referrer_key, v_desc_referrer, now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  INSERT INTO public.referral_rewards (
    attribution_id, beneficiary_user_id, reward_type, reward_amount,
    reward_status, idempotency_key, description, pending_at
  ) VALUES (
    v_attribution_id, p_referred_id, 'referee_credit', v_referee_reward,
    'pending', v_referee_key, v_desc_referee, now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.profiles
  SET
    referred_by = v_referrer_id::text,
    pending_promo_code = v_promo,
    updated_at = now()
  WHERE id = p_referred_id;

  INSERT INTO public.promo_codes (
    code, description, discount_percent, max_redemptions, applies_to, is_active
  )
  SELECT
    v_promo,
    'Referral welcome — ' || v_discount::text || '% off first purchase',
    greatest(0, least(100, round(v_discount)::integer)),
    1,
    'all',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.promo_codes WHERE upper(trim(code)) = v_promo
  );

  -- Ledger grants: p_payment_id carries the unique idempotency key.
  IF v_referee_reward > 0 THEN
    PERFORM public.add_credits(
      p_referred_id,
      v_referee_reward,
      'referral_reward'::credit_action,
      v_desc_referee,
      v_referee_key
    );
    SELECT id INTO v_referee_txn
    FROM public.credit_transactions
    WHERE stripe_payment_id = v_referee_key
    LIMIT 1;

    UPDATE public.referral_rewards
    SET
      reward_status = 'granted',
      granted_at = now(),
      credit_transaction_id = v_referee_txn,
      description = v_desc_referee,
      updated_at = now()
    WHERE idempotency_key = v_referee_key
      AND reward_status <> 'granted';
  ELSE
    UPDATE public.referral_rewards
    SET
      reward_status = 'granted',
      granted_at = now(),
      updated_at = now()
    WHERE idempotency_key = v_referee_key
      AND reward_status <> 'granted';
  END IF;

  IF v_referrer_reward > 0 THEN
    PERFORM public.add_credits(
      v_referrer_id,
      v_referrer_reward,
      'referral_reward'::credit_action,
      v_desc_referrer,
      v_referrer_key
    );
    SELECT id INTO v_referrer_txn
    FROM public.credit_transactions
    WHERE stripe_payment_id = v_referrer_key
    LIMIT 1;

    UPDATE public.referral_rewards
    SET
      reward_status = 'granted',
      granted_at = now(),
      credit_transaction_id = v_referrer_txn,
      description = v_desc_referrer,
      updated_at = now()
    WHERE idempotency_key = v_referrer_key
      AND reward_status <> 'granted';

    UPDATE public.profiles
    SET
      referral_credits_earned = COALESCE(referral_credits_earned, 0) + v_referrer_reward,
      updated_at = now()
    WHERE id = v_referrer_id;
  ELSE
    UPDATE public.referral_rewards
    SET
      reward_status = 'granted',
      granted_at = now(),
      updated_at = now()
    WHERE idempotency_key = v_referrer_key
      AND reward_status <> 'granted';
  END IF;

  UPDATE public.referrals
  SET
    credits_awarded = v_referrer_reward,
    rewarded_at = now(),
    status = 'rewarded'
  WHERE id = v_attribution_id;

  INSERT INTO public.referral_events (
    attribution_id, event_type, event_status, metadata
  ) VALUES (
    v_attribution_id, 'claim_success', 'succeeded',
    jsonb_build_object(
      'reason', 'success',
      'programme_version', v_programme.version,
      'referee_credits', v_referee_reward,
      'referrer_credits', v_referrer_reward,
      'promo_code', v_promo
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'success',
    'referee_credits', v_referee_reward,
    'referrer_credits', v_referrer_reward,
    'promo_code', v_promo,
    'attribution_id', v_attribution_id,
    'discount_percent', v_discount,
    'referrer_id', v_referrer_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_referral_reward(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_referral_reward(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.record_referral_reward(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_referral_reward(UUID, TEXT) TO service_role;

-- ── 6. get_referral_dashboard (authenticated) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_referral_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_programme RECORD;
  v_code TEXT;
  v_eligible BOOLEAN := false;
  v_eligibility_reason TEXT := NULL;
  v_attributed INTEGER := 0;
  v_pending INTEGER := 0;
  v_qualified INTEGER := 0;
  v_rewarded INTEGER := 0;
  v_credits_earned INTEGER := 0;
  v_history JSONB := '[]'::jsonb;
  v_link_base TEXT := 'https://trycareerpilot.com/signup?ref=';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT *
    INTO v_programme
    FROM public.referral_programmes
   WHERE status = 'active'
     AND start_at <= now()
     AND (end_at IS NULL OR end_at > now())
   ORDER BY start_at DESC
   LIMIT 1;

  IF v_programme.id IS NULL THEN
    v_eligible := false;
    v_eligibility_reason := 'programme_disabled';
  ELSE
    v_eligible := true;
    v_eligibility_reason := NULL;
  END IF;

  -- Mint / read code without requiring a separate round-trip.
  BEGIN
    v_code := public.ensure_my_referral_code();
  EXCEPTION WHEN OTHERS THEN
    SELECT upper(btrim(referral_code)) INTO v_code
    FROM public.profiles
    WHERE id = v_uid;
    IF v_code IS NULL OR v_code !~ '^[A-Z0-9]{6,16}$' THEN
      v_eligible := false;
      v_eligibility_reason := COALESCE(v_eligibility_reason, 'code_unavailable');
      v_code := NULL;
    END IF;
  END;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE r.status IN ('pending', 'signed_up'))::integer,
    count(*) FILTER (WHERE r.status = 'converted' OR r.converted_at IS NOT NULL)::integer,
    count(*) FILTER (WHERE r.status = 'rewarded')::integer,
    COALESCE(sum(r.credits_awarded) FILTER (WHERE r.status IN ('rewarded', 'converted')), 0)::integer
  INTO v_attributed, v_pending, v_qualified, v_rewarded, v_credits_earned
  FROM public.referrals r
  WHERE r.referrer_id = v_uid;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'referredEmailMasked', x.referred_email_masked,
        'referredId', x.referred_id,
        'status', x.status,
        'creditsAwarded', x.credits_awarded,
        'signedUpAt', x.signed_up_at,
        'convertedAt', x.converted_at,
        'rewardedAt', x.rewarded_at,
        'createdAt', x.created_at
      )
      ORDER BY x.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_history
  FROM (
    SELECT
      r.id,
      public.mask_email(r.referred_email) AS referred_email_masked,
      r.referred_id,
      r.status,
      r.credits_awarded,
      r.signed_up_at,
      r.converted_at,
      r.rewarded_at,
      r.created_at
    FROM public.referrals r
    WHERE r.referrer_id = v_uid
    ORDER BY r.created_at DESC
    LIMIT 100
  ) x;

  RETURN jsonb_build_object(
    'programme', CASE
      WHEN v_programme.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_programme.id,
        'name', v_programme.name,
        'version', v_programme.version,
        'status', v_programme.status,
        'qualifyingEvent', v_programme.qualifying_event,
        'referrerCreditReward', v_programme.referrer_credit_reward,
        'refereeCreditReward', v_programme.referee_credit_reward,
        'referralDiscountPercent', v_programme.referral_discount_percent,
        'maximumRewards', v_programme.maximum_rewards,
        'termsUrl', v_programme.terms_url,
        'startAt', v_programme.start_at,
        'endAt', v_programme.end_at
      )
    END,
    'account', jsonb_build_object(
      'eligible', v_eligible AND v_code IS NOT NULL,
      'referralCode', v_code,
      'referralLink', CASE WHEN v_code IS NOT NULL THEN v_link_base || v_code ELSE NULL END,
      'referralLinkBase', v_link_base,
      'eligibilityReason', CASE
        WHEN v_eligible AND v_code IS NOT NULL THEN NULL
        ELSE COALESCE(v_eligibility_reason, 'ineligible')
      END
    ),
    'summary', jsonb_build_object(
      'attributed', v_attributed,
      'pending', v_pending,
      'qualified', v_qualified,
      'rewarded', v_rewarded,
      'creditsEarned', v_credits_earned
    ),
    'history', v_history
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_referral_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_referral_dashboard() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_referral_dashboard() TO authenticated;

-- ── 7. mark_referral_converted (service_role) ────────────────────────────────
-- Sets converted_at; status=converted unless already rewarded (keep rewarded).
-- Inserts event; never grants a second credit.

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

  IF v_row.status = 'rewarded' THEN
    v_new_status := 'rewarded';
  ELSE
    v_new_status := 'converted';
  END IF;

  UPDATE public.referrals
  SET
    converted_at = COALESCE(converted_at, now()),
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

-- ── 8. Preserve existing grants for ensure_my_referral_code / get_my_referrals

REVOKE ALL ON FUNCTION public.ensure_my_referral_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_my_referral_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_referral_code() TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_referrals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_referrals() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_referrals() TO authenticated;
