-- Harden admin ban: also set auth.users.banned_until so signInWithPassword fails server-side.
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
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_credits := (p_patch->>'add_credits')::INTEGER;
  v_plan := p_patch->>'plan_id';
  v_banned := (p_patch->>'is_banned')::BOOLEAN;

  IF v_credits IS NOT NULL THEN
    UPDATE public.profiles SET credits = credits + v_credits, updated_at = now()
    WHERE id = ANY(p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF v_plan IS NOT NULL THEN
    UPDATE public.profiles SET plan_id = v_plan::plan_tier, updated_at = now()
    WHERE id = ANY(p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF v_banned IS NOT NULL THEN
    UPDATE public.profiles SET is_banned = v_banned, updated_at = now()
    WHERE id = ANY(p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Server-side Auth ban so refresh/login fail without relying on client profile checks.
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
