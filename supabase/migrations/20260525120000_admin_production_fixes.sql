-- Admin dashboard: allow authenticated admins to call bulk_update_users (enforced inside function)
GRANT EXECUTE ON FUNCTION public.bulk_update_users(uuid[], jsonb) TO authenticated;

-- Question bank: admins can list/edit all questions (seed + editor)
DROP POLICY IF EXISTS questions_admin_all ON public.questions;
CREATE POLICY questions_admin_all ON public.questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
