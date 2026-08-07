DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_admin_read ON public.billing_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS pricing_read ON public.model_pricing;
CREATE POLICY pricing_admin_read ON public.model_pricing
  FOR SELECT TO authenticated
  USING (public.is_admin());
REVOKE SELECT ON public.model_pricing FROM anon;