-- Pass 1: Rewrite profiles_own_update with NULL-safe checks for nullable protected columns,
-- and add an explicit admin update policy.

DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Non-nullable protected columns: strict equality
    AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
    AND plan_id  = (SELECT p.plan_id  FROM public.profiles p WHERE p.id = auth.uid())
    AND credits  = (SELECT p.credits  FROM public.profiles p WHERE p.id = auth.uid())
    AND is_banned = (SELECT p.is_banned FROM public.profiles p WHERE p.id = auth.uid())
    -- Nullable protected columns: NULL-safe equality
    AND stripe_customer_id IS NOT DISTINCT FROM
        (SELECT p.stripe_customer_id FROM public.profiles p WHERE p.id = auth.uid())
    AND subscription_id IS NOT DISTINCT FROM
        (SELECT p.subscription_id FROM public.profiles p WHERE p.id = auth.uid())
    AND ban_reason IS NOT DISTINCT FROM
        (SELECT p.ban_reason FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Explicit admin update policy (uses has_role to avoid recursion).
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));