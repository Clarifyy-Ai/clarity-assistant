-- 1) Lock down SECURITY DEFINER function from anonymous/public execution
REVOKE EXECUTE ON FUNCTION public.get_my_referrals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_referrals() FROM anon;

-- 2) calendar_integrations: hide OAuth tokens from client reads (column-level privileges)
REVOKE SELECT ON public.calendar_integrations FROM anon;
REVOKE SELECT ON public.calendar_integrations FROM authenticated;
GRANT SELECT (id, user_id, provider, expires_at, created_at) ON public.calendar_integrations TO authenticated;

-- 3) referrals: hide raw referred_email from client reads (masked email available via get_my_referrals RPC)
REVOKE SELECT ON public.referrals FROM anon;
REVOKE SELECT ON public.referrals FROM authenticated;
GRANT SELECT (id, referrer_id, referred_id, status, credits_awarded, signed_up_at, converted_at, rewarded_at, created_at) ON public.referrals TO authenticated;

-- 4) rooms: hide password_hash from client reads
REVOKE SELECT ON public.rooms FROM anon;
REVOKE SELECT ON public.rooms FROM authenticated;
GRANT SELECT (id, host_id, name, description, status, room_code, is_private, max_participants, topic, interview_type, started_at, ended_at, created_at, updated_at) ON public.rooms TO authenticated;

-- 5) Realtime: scope room channels to room members (covers room:{id} and presence:room:{id} topics)
CREATE POLICY "room_members_can_read_room_topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    realtime.topic() LIKE 'room:%'
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.user_id = auth.uid()
        AND rp.room_id::text = split_part(realtime.topic(), ':', 2)
    )
  )
  OR (
    realtime.topic() LIKE 'presence:room:%'
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.user_id = auth.uid()
        AND rp.room_id::text = split_part(realtime.topic(), ':', 3)
    )
  )
);

CREATE POLICY "room_members_can_write_room_topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (
    realtime.topic() LIKE 'room:%'
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.user_id = auth.uid()
        AND rp.room_id::text = split_part(realtime.topic(), ':', 2)
    )
  )
  OR (
    realtime.topic() LIKE 'presence:room:%'
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.user_id = auth.uid()
        AND rp.room_id::text = split_part(realtime.topic(), ':', 3)
    )
  )
);