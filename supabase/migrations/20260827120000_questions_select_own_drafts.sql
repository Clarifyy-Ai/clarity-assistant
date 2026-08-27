-- Allow question owners to SELECT their own drafts (fixes PostgREST RETURNING 403
-- after AdminQuestionEditor create when row is not yet published/verified).
-- Admins retain full SELECT; published+verified public rows remain readable.

DROP POLICY IF EXISTS "questions_select" ON public.questions;
CREATE POLICY "questions_select" ON public.questions FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR uploaded_by = auth.uid()
    OR (
      is_public = true
      AND publish_status = 'published'
      AND review_status = 'approved'
      AND is_verified = true
    )
  );
