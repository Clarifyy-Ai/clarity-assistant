
-- ============================================================
-- 1. Recreate user-data policies with TO authenticated
-- ============================================================

-- sessions
DROP POLICY IF EXISTS sessions_own ON public.sessions;
DROP POLICY IF EXISTS sessions_admin ON public.sessions;
CREATE POLICY sessions_own ON public.sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY sessions_admin ON public.sessions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- documents
DROP POLICY IF EXISTS documents_own ON public.documents;
DROP POLICY IF EXISTS documents_admin ON public.documents;
CREATE POLICY documents_own ON public.documents FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY documents_admin ON public.documents FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- interviews
DROP POLICY IF EXISTS interviews_own ON public.interviews;
DROP POLICY IF EXISTS interviews_admin ON public.interviews;
CREATE POLICY interviews_own ON public.interviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY interviews_admin ON public.interviews FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- session_transcripts
DROP POLICY IF EXISTS transcripts_own ON public.session_transcripts;
DROP POLICY IF EXISTS transcripts_admin ON public.session_transcripts;
CREATE POLICY transcripts_own ON public.session_transcripts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY transcripts_admin ON public.session_transcripts FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- session_ai_interactions
DROP POLICY IF EXISTS ai_own ON public.session_ai_interactions;
DROP POLICY IF EXISTS ai_admin ON public.session_ai_interactions;
CREATE POLICY ai_own ON public.session_ai_interactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ai_admin ON public.session_ai_interactions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- answers
DROP POLICY IF EXISTS answers_own ON public.answers;
DROP POLICY IF EXISTS answers_admin ON public.answers;
CREATE POLICY answers_own ON public.answers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY answers_admin ON public.answers FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- debriefs
DROP POLICY IF EXISTS debriefs_own ON public.debriefs;
DROP POLICY IF EXISTS debriefs_admin ON public.debriefs;
CREATE POLICY debriefs_own ON public.debriefs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY debriefs_admin ON public.debriefs FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- credit_transactions
DROP POLICY IF EXISTS credits_select ON public.credit_transactions;
DROP POLICY IF EXISTS credits_admin ON public.credit_transactions;
CREATE POLICY credits_select ON public.credit_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY credits_admin ON public.credit_transactions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- subscriptions
DROP POLICY IF EXISTS subs_select ON public.subscriptions;
DROP POLICY IF EXISTS subs_admin ON public.subscriptions;
CREATE POLICY subs_select ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY subs_admin ON public.subscriptions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- notifications
DROP POLICY IF EXISTS notifications_own ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
DROP POLICY IF EXISTS notifications_admin ON public.notifications;
CREATE POLICY notifications_own ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY notifications_admin ON public.notifications FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- rooms
DROP POLICY IF EXISTS rooms_read ON public.rooms;
DROP POLICY IF EXISTS rooms_manage ON public.rooms;
DROP POLICY IF EXISTS rooms_admin ON public.rooms;
CREATE POLICY rooms_read ON public.rooms FOR SELECT TO authenticated USING ((is_private = false) OR (host_id = auth.uid()));
CREATE POLICY rooms_manage ON public.rooms FOR ALL TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY rooms_admin ON public.rooms FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- room_participants
DROP POLICY IF EXISTS rp_select ON public.room_participants;
DROP POLICY IF EXISTS rp_insert ON public.room_participants;
DROP POLICY IF EXISTS rp_update ON public.room_participants;
DROP POLICY IF EXISTS rp_admin ON public.room_participants;
CREATE POLICY rp_select ON public.room_participants FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY rp_insert ON public.room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY rp_update ON public.room_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY rp_admin ON public.room_participants FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- user_achievements
DROP POLICY IF EXISTS ua_select ON public.user_achievements;
DROP POLICY IF EXISTS ua_admin ON public.user_achievements;
CREATE POLICY ua_select ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ua_admin ON public.user_achievements FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- model_cost_logs
DROP POLICY IF EXISTS model_cost_select ON public.model_cost_logs;
DROP POLICY IF EXISTS cost_admin ON public.model_cost_logs;
CREATE POLICY model_cost_select ON public.model_cost_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cost_admin ON public.model_cost_logs FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- admin_audit_log
DROP POLICY IF EXISTS audit_admin ON public.admin_audit_log;
CREATE POLICY audit_admin ON public.admin_audit_log FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- mock_tests
DROP POLICY IF EXISTS mock_tests_all ON public.mock_tests;
CREATE POLICY mock_tests_all ON public.mock_tests FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- test_responses
DROP POLICY IF EXISTS test_responses_all ON public.test_responses;
CREATE POLICY test_responses_all ON public.test_responses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- test_analyses
DROP POLICY IF EXISTS test_analyses_all ON public.test_analyses;
CREATE POLICY test_analyses_all ON public.test_analyses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- revision_list
DROP POLICY IF EXISTS revision_list_all ON public.revision_list;
CREATE POLICY revision_list_all ON public.revision_list FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- user_topic_performance
DROP POLICY IF EXISTS utp_all ON public.user_topic_performance;
CREATE POLICY utp_all ON public.user_topic_performance FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 2. Fix request_metrics insert (was WITH CHECK true)
-- ============================================================
DROP POLICY IF EXISTS request_metrics_authed_insert ON public.request_metrics;
CREATE POLICY request_metrics_authed_insert ON public.request_metrics
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. Storage: avatars bucket — restrict listing & uploads
-- ============================================================
DROP POLICY IF EXISTS avatars_read ON storage.objects;
DROP POLICY IF EXISTS avatars_upload ON storage.objects;

-- Listing/SELECT only owner's folder (public bucket public URLs still work via CDN)
CREATE POLICY avatars_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY avatars_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- question_images_admin_insert had no WITH CHECK
DROP POLICY IF EXISTS question_images_admin_insert ON storage.objects;
CREATE POLICY question_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-images' AND has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 4. Revoke EXECUTE from anon on sensitive SECURITY DEFINER fns
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, credit_action, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(text, integer, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_topic_performance(text, text, text, integer, integer, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_update_users(uuid[], jsonb) FROM PUBLIC, anon;

-- add_credits should only be called from edge functions / service role, not even by authenticated users
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, credit_action, text, text) FROM authenticated;
