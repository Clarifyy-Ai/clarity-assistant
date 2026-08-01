REVOKE ALL ON FUNCTION public.create_test_atomic(uuid, text, jsonb, text[], integer, integer) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.claim_and_complete_test(uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[], jsonb, integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_test_atomic(uuid, text, jsonb, text[], integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_and_complete_test(uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[], jsonb, integer) TO authenticated, service_role;