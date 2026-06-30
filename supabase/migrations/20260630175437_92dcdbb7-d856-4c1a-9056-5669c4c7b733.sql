
-- 1) profiles: drop redundant admin update policy
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;

-- 2) questions: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS questions_select ON public.questions;
CREATE POLICY questions_select ON public.questions
  FOR SELECT
  TO authenticated
  USING ((is_public = true) OR (uploaded_by = auth.uid()));
REVOKE SELECT ON public.questions FROM anon;

-- 3) request_metrics: enforce user_id NOT NULL (delete legacy null rows first)
DELETE FROM public.request_metrics WHERE user_id IS NULL;
ALTER TABLE public.request_metrics ALTER COLUMN user_id SET NOT NULL;

-- 4) room_participants: prevent users from changing their own role via UPDATE
DROP POLICY IF EXISTS rp_update ON public.room_participants;
CREATE POLICY rp_update ON public.room_participants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND role = (
      SELECT rp.role FROM public.room_participants rp
      WHERE rp.id = room_participants.id
    )
  );
