-- Moderator is a content-only staff role. It never grants billing, user, or
-- platform-admin access.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'moderator')
$$;

REVOKE ALL ON FUNCTION public.is_moderator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated, service_role;

COMMENT ON FUNCTION public.is_moderator() IS
  'True when the current JWT user has app_role moderator. Content moderation only.';

-- Community: moderators can read reported/hidden posts and update/delete for moderation.
DROP POLICY IF EXISTS community_posts_select ON public.community_posts;
CREATE POLICY community_posts_select ON public.community_posts
  FOR SELECT TO authenticated
  USING (
    status IN ('PUBLISHED','REPORTED','RESOLVED')
    OR user_id = auth.uid()
    OR public.is_admin()
    OR public.is_moderator()
  );

DROP POLICY IF EXISTS community_posts_update ON public.community_posts;
CREATE POLICY community_posts_update ON public.community_posts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_moderator())
  WITH CHECK (user_id = auth.uid() OR public.is_admin() OR public.is_moderator());

DROP POLICY IF EXISTS community_posts_delete ON public.community_posts;
CREATE POLICY community_posts_delete ON public.community_posts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_moderator());

DROP POLICY IF EXISTS community_answers_select ON public.community_answers;
CREATE POLICY community_answers_select ON public.community_answers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id
        AND (
          p.status IN ('PUBLISHED','REPORTED','RESOLVED')
          OR p.user_id = auth.uid()
          OR public.is_admin()
          OR public.is_moderator()
        )
    )
  );

DROP POLICY IF EXISTS community_answers_update ON public.community_answers;
CREATE POLICY community_answers_update ON public.community_answers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_moderator())
  WITH CHECK (user_id = auth.uid() OR public.is_admin() OR public.is_moderator());

DROP POLICY IF EXISTS community_answers_delete ON public.community_answers;
CREATE POLICY community_answers_delete ON public.community_answers
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_moderator());

DROP POLICY IF EXISTS community_comments_update ON public.community_comments;
CREATE POLICY community_comments_update ON public.community_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_moderator())
  WITH CHECK (user_id = auth.uid() OR public.is_admin() OR public.is_moderator());

DROP POLICY IF EXISTS community_comments_delete ON public.community_comments;
CREATE POLICY community_comments_delete ON public.community_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_moderator());

DROP POLICY IF EXISTS community_reports_select ON public.community_reports;
CREATE POLICY community_reports_select ON public.community_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin() OR public.is_moderator());

DROP POLICY IF EXISTS community_reports_update ON public.community_reports;
CREATE POLICY community_reports_update ON public.community_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_moderator())
  WITH CHECK (public.is_admin() OR public.is_moderator());

-- Questions: moderators may review/hide existing rows, not insert or delete.
DROP POLICY IF EXISTS questions_moderator_select ON public.questions;
CREATE POLICY questions_moderator_select ON public.questions
  FOR SELECT TO authenticated
  USING (public.is_moderator());

DROP POLICY IF EXISTS questions_moderator_update ON public.questions;
CREATE POLICY questions_moderator_update ON public.questions
  FOR UPDATE TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());

COMMIT;
