-- 1) Prevent self role escalation on room_participants via policy (defense in depth alongside existing trigger)
DROP POLICY IF EXISTS rp_update ON public.room_participants;

CREATE POLICY rp_update ON public.room_participants
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.room_participants old
    WHERE old.id = room_participants.id
      AND old.role IS NOT DISTINCT FROM room_participants.role
      AND old.user_id IS NOT DISTINCT FROM room_participants.user_id
      AND old.room_id IS NOT DISTINCT FROM room_participants.room_id
  )
);

-- 2) Prevent created_by spoofing on room_questions
ALTER TABLE public.room_questions ALTER COLUMN created_by SET DEFAULT auth.uid();

UPDATE public.room_questions SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM auth.users);

DROP POLICY IF EXISTS room_questions_insert ON public.room_questions;

CREATE POLICY room_questions_insert ON public.room_questions
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.room_participants rp
    WHERE rp.room_id = room_questions.room_id
      AND rp.user_id = auth.uid()
  )
);