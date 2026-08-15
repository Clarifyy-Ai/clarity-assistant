-- Production-readiness P0: billing ledger, referral hardening, trigger RPC
-- lockdown, admin credit caps, answer-key view semantics, interview-day
-- checklists, document cleanup cron. Additive only; does not rewrite history.

-- ── 1. payment_orders durable ledger ────────────────────────────────────────

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reconciliation_reason text,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.payment_orders
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_user_id_fkey;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'provider_created'::text,
    'created'::text,
    'paid'::text,
    'fulfilled'::text,
    'failed'::text,
    'cancelled'::text,
    'refunded'::text,
    'reconciliation_required'::text
  ]));

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_order_id_uidx
  ON public.payment_orders (provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_idempotency_key_uidx
  ON public.payment_orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND user_id IS NOT NULL;

REVOKE ALL ON public.payment_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;

DROP POLICY IF EXISTS payment_orders_select_own ON public.payment_orders;
CREATE POLICY payment_orders_select_own ON public.payment_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.billing_reconciliation_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_order_id text,
  payment_order_id uuid,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_reconciliation_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_reconciliation_admin ON public.billing_reconciliation_incidents;
CREATE POLICY billing_reconciliation_admin ON public.billing_reconciliation_incidents
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON public.billing_reconciliation_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.billing_reconciliation_incidents TO authenticated;
GRANT ALL ON public.billing_reconciliation_incidents TO service_role;

-- ── 2. Referral claim hardening (compensating; original 170000 not in remote) ─

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

REVOKE ALL ON FUNCTION public.ensure_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_referral_code() TO authenticated;

DROP POLICY IF EXISTS referrals_insert ON public.referrals;
DROP POLICY IF EXISTS referrals_update ON public.referrals;
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM PUBLIC, anon, authenticated;

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
  v_inserted UUID;
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
  ON CONFLICT (referred_id) DO NOTHING
  RETURNING referred_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_recorded');
  END IF;

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

-- ── 3. Trigger-only gap analysis helpers ────────────────────────────────────

REVOKE ALL ON FUNCTION public.mark_gap_analyses_stale_for_resume() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_gap_analyses_stale_for_jd() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_gap_analyses_stale_for_resume() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.mark_gap_analyses_stale_for_jd() TO postgres, service_role;

-- ── 4. Admin credit grant cap ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bulk_update_users(p_user_ids uuid[], p_patch jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_credits INTEGER;
  v_plan TEXT;
  v_banned BOOLEAN;
  v_uid UUID;
  v_monthly INTEGER;
  v_current INTEGER;
  v_delta INTEGER;
  v_reason TEXT;
  v_granted_today INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_credits := (p_patch->>'add_credits')::INTEGER;
  v_plan := p_patch->>'plan_id';
  v_banned := (p_patch->>'is_banned')::BOOLEAN;
  v_reason := NULLIF(btrim(COALESCE(p_patch->>'reason', '')), '');

  IF v_credits IS NOT NULL THEN
    IF v_credits < 0 OR v_credits > 5000 THEN
      RAISE EXCEPTION 'add_credits must be between 0 and 5000 per operation';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'reason is required for credit grants';
    END IF;

    SELECT COALESCE(SUM(
      COALESCE((new_value->'patch'->>'add_credits')::integer, 0)
      * GREATEST(jsonb_array_length(COALESCE(new_value->'user_ids', '[]'::jsonb)), 0)
    ), 0)
      INTO v_granted_today
    FROM public.admin_audit_log
    WHERE admin_id = auth.uid()
      AND action = 'bulk_update_users'
      AND created_at >= date_trunc('day', timezone('utc', now()));

    IF COALESCE(v_granted_today, 0) + (v_credits * COALESCE(array_length(p_user_ids, 1), 0)) > 20000 THEN
      RAISE EXCEPTION 'daily admin credit grant cap exceeded (20000)';
    END IF;

    FOREACH v_uid IN ARRAY p_user_ids LOOP
      PERFORM public.add_credits(
        v_uid,
        v_credits,
        'admin_adjustment',
        'Admin credit grant: ' || v_reason,
        NULL
      );
    END LOOP;
    v_count := COALESCE(array_length(p_user_ids, 1), 0);
  END IF;

  IF v_plan IS NOT NULL THEN
    v_monthly := public.plan_monthly_credits(v_plan);

    FOREACH v_uid IN ARRAY p_user_ids LOOP
      UPDATE public.profiles
      SET
        plan_id = v_plan::plan_tier,
        subscription_status = CASE
          WHEN v_plan IN ('pro', 'elite', 'enterprise') THEN 'active'
          ELSE COALESCE(subscription_status, 'active')
        END,
        updated_at = now()
      WHERE id = v_uid;

      INSERT INTO public.subscriptions (user_id, plan_id, status, monthly_credits, created_at, updated_at)
      VALUES (v_uid, v_plan::plan_tier, 'active', v_monthly, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        monthly_credits = EXCLUDED.monthly_credits,
        updated_at = now();

      IF v_plan IN ('pro', 'elite', 'enterprise') THEN
        SELECT credits INTO v_current FROM public.profiles WHERE id = v_uid;
        v_delta := GREATEST(0, v_monthly - COALESCE(v_current, 0));
        IF v_delta > 0 THEN
          PERFORM public.add_credits(
            v_uid,
            v_delta,
            'subscription_grant',
            'Admin plan grant — ' || v_plan,
            NULL
          );
        END IF;
      END IF;
    END LOOP;

    v_count := COALESCE(array_length(p_user_ids, 1), 0);
  END IF;

  IF v_banned IS NOT NULL THEN
    UPDATE public.profiles SET is_banned = v_banned, updated_at = now()
    WHERE id = ANY(p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_banned THEN
      UPDATE auth.users
      SET banned_until = 'infinity'::timestamptz
      WHERE id = ANY(p_user_ids);
    ELSE
      UPDATE auth.users
      SET banned_until = NULL
      WHERE id = ANY(p_user_ids);
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, action, target_type, new_value)
  VALUES (auth.uid(), 'bulk_update_users', 'profiles',
          jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'patch', p_patch));

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_update_users(uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_update_users(uuid[], jsonb) TO authenticated;

-- ── 5. questions_playable security barrier (no answer keys) ─────────────────

CREATE OR REPLACE VIEW public.questions_playable
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  id,
  question_text,
  question_html,
  question_type,
  options,
  subject,
  topic,
  subtopic,
  category,
  tags,
  difficulty,
  exam_type,
  source,
  source_year,
  source_paper,
  marks_positive,
  marks_negative,
  time_limit_seconds,
  has_image,
  image_url,
  latex_present,
  is_verified,
  is_public,
  uploaded_by,
  created_at
FROM public.questions
WHERE
  is_public = true
  OR uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.mock_tests mt
    WHERE mt.user_id = auth.uid()
      AND mt.question_ids @> ARRAY[questions.id]
  );

REVOKE ALL ON public.questions_playable FROM PUBLIC, anon;
GRANT SELECT ON public.questions_playable TO authenticated, service_role;

DROP POLICY IF EXISTS questions_select ON public.questions;
CREATE POLICY questions_select ON public.questions
  FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid());

DROP POLICY IF EXISTS questions_select_own_attempts ON public.questions;
CREATE POLICY questions_select_own_attempts ON public.questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mock_tests mt
      WHERE mt.user_id = auth.uid()
        AND mt.status = 'COMPLETED'
        AND mt.question_ids @> ARRAY[questions.id]
    )
  );

-- ── 6. Interview Day checklist persistence ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.interview_day_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interview_id uuid NOT NULL,
  item_id text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, interview_id, item_id)
);

ALTER TABLE public.interview_day_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interview_day_checklists_own ON public.interview_day_checklists;
CREATE POLICY interview_day_checklists_own ON public.interview_day_checklists
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_day_checklists TO authenticated;
GRANT ALL ON public.interview_day_checklists TO service_role;

-- ── 7. Expired document cleanup cron (if function exists) ───────────────────

DO $cron$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_expired_documents'
  ) THEN
    PERFORM cron.unschedule('cleanup-expired-documents-daily');
    PERFORM cron.schedule(
      'cleanup-expired-documents-daily',
      '30 4 * * *',
      $job$SELECT public.cleanup_expired_documents()$job$
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END;
$cron$;
