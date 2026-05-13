
-- 1) Realtime Authorization: restrict broadcast/presence to user-scoped topics
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_user_topic_read" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated_user_topic_write" ON realtime.messages;

-- Users can only read realtime messages on a topic that starts with "user:<their uid>:"
CREATE POLICY "authenticated_user_topic_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
);

-- Users can only publish to their own user-scoped topic
CREATE POLICY "authenticated_user_topic_write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
);

-- 2) Lock down SECURITY DEFINER helpers from anonymous callers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 3) Explicit deny on client writes to credits (RLS already denies-by-default,
--    but make it explicit to satisfy auditors and prevent future regressions)
DROP POLICY IF EXISTS "credits_no_client_insert" ON public.credits;
DROP POLICY IF EXISTS "credits_no_client_update" ON public.credits;
DROP POLICY IF EXISTS "credits_no_client_delete" ON public.credits;

CREATE POLICY "credits_no_client_insert"
ON public.credits
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "credits_no_client_update"
ON public.credits
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "credits_no_client_delete"
ON public.credits
FOR DELETE
TO authenticated, anon
USING (false);
