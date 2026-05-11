
-- Companies: scope policies to authenticated role
DROP POLICY IF EXISTS companies_own ON public.companies;
DROP POLICY IF EXISTS companies_admin ON public.companies;
CREATE POLICY companies_own ON public.companies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY companies_admin ON public.companies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Storage: avatars are in a public bucket; remove owner-only SELECT so public URLs work
DROP POLICY IF EXISTS avatars_read ON storage.objects;

-- Storage: question-images is public; remove broad listing policies (public URL access still works)
DROP POLICY IF EXISTS question_images_anon_read_by_path ON storage.objects;
DROP POLICY IF EXISTS question_images_authed_read ON storage.objects;

-- Lock down trigger-only / internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_admin_column() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
