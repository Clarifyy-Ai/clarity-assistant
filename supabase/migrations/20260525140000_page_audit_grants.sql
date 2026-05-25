-- Page audit: notifications batch read + admin mock test analytics
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid) TO authenticated;

DROP POLICY IF EXISTS mock_tests_admin_select ON public.mock_tests;
CREATE POLICY mock_tests_admin_select ON public.mock_tests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
