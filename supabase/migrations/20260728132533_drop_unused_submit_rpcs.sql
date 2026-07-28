-- Drop unused mock-test RPCs (no app callers; submit-test edge path owns this flow).
DROP FUNCTION IF EXISTS public.submit_test_atomic(
  uuid, uuid, numeric, numeric, integer, integer, jsonb, jsonb, text[], text[], jsonb, integer
);
DROP FUNCTION IF EXISTS public.acquire_submit_lock(uuid, uuid);
