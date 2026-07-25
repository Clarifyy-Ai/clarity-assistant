-- Promo codes must not be enumerable by regular authenticated clients.
-- Keep table SELECT privilege so admin RLS policy can function; remove the
-- public "read all active codes" policy so non-admins see nothing.

DROP POLICY IF EXISTS promo_codes_read_active ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_read_active" ON public.promo_codes;

-- Ensure admin policy remains (matches prior has_role('admin') gate).
DROP POLICY IF EXISTS promo_codes_admin_all ON public.promo_codes;
CREATE POLICY promo_codes_admin_all ON public.promo_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
