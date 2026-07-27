-- Lock down deduct_credits: Edge Functions (service_role) only.
-- Authenticated clients must use the deduct-credits Edge Function.
-- Temporary compatibility note: any remaining client RPC callers will fail
-- closed until migrated to fetchEdge("deduct-credits").

BEGIN;

REVOKE EXECUTE ON FUNCTION public.deduct_credits(text, integer, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_credits(text, integer, uuid)
  TO service_role;

COMMENT ON FUNCTION public.deduct_credits(text, integer, uuid) IS
  'Atomic credit deduction. EXECUTE granted to service_role only — invoke via deduct-credits Edge Function.';

COMMIT;
