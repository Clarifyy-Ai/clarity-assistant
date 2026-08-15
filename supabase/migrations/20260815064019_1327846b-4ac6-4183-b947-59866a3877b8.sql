CREATE OR REPLACE FUNCTION public.plan_monthly_credits(p_plan text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
  SELECT CASE lower(coalesce(p_plan, 'free'))
    WHEN 'enterprise' THEN 4000
    WHEN 'pro' THEN 1400
    WHEN 'elite' THEN 1400
    WHEN 'starter' THEN 50
    WHEN 'free' THEN 50
    ELSE 50
  END;
$function$;