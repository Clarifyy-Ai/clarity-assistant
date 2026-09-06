-- Availability checks abandon expired attempts before counting inventory.
-- PostgreSQL rejects that UPDATE while these functions are marked STABLE.

BEGIN;

ALTER FUNCTION public.assessment_template_availability(uuid) VOLATILE;
ALTER FUNCTION public.assessment_templates_availability(uuid[]) VOLATILE;

COMMENT ON FUNCTION public.assessment_template_availability(uuid) IS
  'Checks assessment inventory and attempt state; VOLATILE because it invalidates expired attempts.';

COMMENT ON FUNCTION public.assessment_templates_availability(uuid[]) IS
  'Batch assessment availability check; VOLATILE because delegated checks may invalidate expired attempts.';

COMMIT;
