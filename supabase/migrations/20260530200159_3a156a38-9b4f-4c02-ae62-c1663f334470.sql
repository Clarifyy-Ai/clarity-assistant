
-- Phase 1: Security/RLS hardening

-- 1) referrals: drop overly permissive UPDATE policy.
-- Status transitions (pending -> converted -> rewarded) must go through service_role
-- (edge functions on signup/conversion). Referrers do not need to edit rows directly.
DROP POLICY IF EXISTS referrals_update ON public.referrals;

-- 2) room_chat: tighten INSERT to require the sender be a participant of the room.
DROP POLICY IF EXISTS room_chat_insert ON public.room_chat;
CREATE POLICY room_chat_insert ON public.room_chat
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.room_participants rp
      WHERE rp.room_id = room_chat.room_id
        AND rp.user_id = auth.uid()
        AND rp.left_at IS NULL
    )
  );

-- 3) refund_credits: only service_role may call (defence in depth; body already rejects).
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(integer) TO service_role;

-- Note: profiles UPDATE policy already includes a WITH CHECK that pins is_admin,
-- plan_id, credits, is_banned, stripe_customer_id, subscription_id, ban_reason
-- to their existing values for non-admins -- no change needed.

-- Note: realtime.messages lives in the reserved `realtime` schema and is not
-- modified here. Topic-level authorization for room/support channels is enforced
-- in the application layer (room_participants + support_threads ownership checks).
