-- Wave 7: reaffirm assessment response RLS triad (select / insert / update).
-- Owner SELECT always; owner INSERT/UPDATE only while parent mock_tests attempt is live.

BEGIN;

DROP POLICY IF EXISTS test_responses_own_select ON public.test_responses;
CREATE POLICY test_responses_own_select ON public.test_responses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS test_responses_own_insert ON public.test_responses;
CREATE POLICY test_responses_own_insert ON public.test_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.mock_tests mt
      WHERE mt.id = test_id
        AND mt.user_id = auth.uid()
        AND mt.status = 'IN_PROGRESS'
        AND mt.started_at IS NOT NULL
        AND (mt.expires_at IS NULL OR mt.expires_at > clock_timestamp())
    )
  );

DROP POLICY IF EXISTS test_responses_own_update ON public.test_responses;
CREATE POLICY test_responses_own_update ON public.test_responses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.mock_tests mt
      WHERE mt.id = test_id
        AND mt.user_id = auth.uid()
        AND mt.status = 'IN_PROGRESS'
        AND mt.started_at IS NOT NULL
        AND (mt.expires_at IS NULL OR mt.expires_at > clock_timestamp())
    )
  );

-- Ensure broad ALL policies do not reappear and override least-privilege writes.
DROP POLICY IF EXISTS test_responses_all ON public.test_responses;
DROP POLICY IF EXISTS "test_responses_all" ON public.test_responses;

COMMIT;
