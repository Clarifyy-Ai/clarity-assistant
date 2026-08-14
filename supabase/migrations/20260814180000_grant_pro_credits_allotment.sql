-- Admin "Grant Pro" previously only flipped profiles.plan_id. Subscriptions
-- stayed on the free 50-credit default and no allotment was granted, so Pro
-- users looked out of credits. Grant the catalog allotment and write a ledger
-- row via add_credits.

CREATE OR REPLACE FUNCTION public.plan_monthly_credits(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_plan, 'free'))
    WHEN 'enterprise' THEN 4000
    WHEN 'pro' THEN 1400
    WHEN 'elite' THEN 1400
    WHEN 'starter' THEN 50
    WHEN 'free' THEN 50
    ELSE 50
  END;
$$;

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
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_credits := (p_patch->>'add_credits')::INTEGER;
  v_plan := p_patch->>'plan_id';
  v_banned := (p_patch->>'is_banned')::BOOLEAN;

  IF v_credits IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_user_ids LOOP
      PERFORM public.add_credits(
        v_uid,
        v_credits,
        'admin_adjustment',
        'Admin credit grant',
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

REVOKE ALL ON FUNCTION public.plan_monthly_credits(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_monthly_credits(text) TO authenticated, service_role;

-- Repair paid plans that were flipped without the catalog allotment.
-- Signature of the bug: subscriptions.monthly_credits still at the free default (50).
DO $$
DECLARE
  r RECORD;
  v_monthly INTEGER;
  v_delta INTEGER;
BEGIN
  FOR r IN
    SELECT p.id, p.credits, p.plan_id::text AS plan
    FROM public.profiles p
    JOIN public.subscriptions s ON s.user_id = p.id
    WHERE p.plan_id::text IN ('pro', 'elite', 'enterprise')
      AND s.monthly_credits = 50
      AND p.deleted_at IS NULL
  LOOP
    v_monthly := public.plan_monthly_credits(r.plan);

    UPDATE public.subscriptions
    SET
      monthly_credits = v_monthly,
      plan_id = r.plan::plan_tier,
      status = 'active',
      updated_at = now()
    WHERE user_id = r.id;

    UPDATE public.profiles
    SET
      subscription_status = COALESCE(subscription_status, 'active'),
      updated_at = now()
    WHERE id = r.id;

    v_delta := GREATEST(0, v_monthly - COALESCE(r.credits, 0));
    IF v_delta > 0 THEN
      PERFORM public.add_credits(
        r.id,
        v_delta,
        'admin_adjustment',
        'Reconcile paid-plan monthly credits after grant-pro without allotment',
        NULL
      );
    END IF;
  END LOOP;
END $$;
