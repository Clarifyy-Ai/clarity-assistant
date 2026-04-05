
-- SEC-1: Restrict user_roles INSERT/UPDATE/DELETE to admins only
CREATE POLICY "user_roles_admin_insert"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_update"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_delete"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- SEC-2: Fix profiles RLS — drop public-scoped policies and recreate as authenticated
DROP POLICY IF EXISTS "profiles_own_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_insert" ON public.profiles;

CREATE POLICY "profiles_own_select"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "profiles_own_insert"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- SEC-3: Fix feature_flags read — drop public policy and recreate as authenticated
DROP POLICY IF EXISTS "flags_read" ON public.feature_flags;

CREATE POLICY "flags_read"
ON public.feature_flags FOR SELECT TO authenticated
USING (true);
