
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 200;
ALTER TABLE public.subscriptions ALTER COLUMN monthly_credits SET DEFAULT 200;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, credits, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    200, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan_id, status, monthly_credits)
  VALUES (NEW.id, 'free', 'active', 200)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
