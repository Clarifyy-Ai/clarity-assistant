-- Performance indexes for common query patterns

-- Sessions: user_id + created_at DESC (dashboard recent sessions)
CREATE INDEX IF NOT EXISTS idx_sessions_user_created 
  ON public.sessions(user_id, created_at DESC);

-- Session answers: by session_id (debrief loading)
CREATE INDEX IF NOT EXISTS idx_session_answers_session 
  ON public.session_answers(session_id);

-- Session transcripts: by session_id
CREATE INDEX IF NOT EXISTS idx_session_transcripts_session 
  ON public.session_transcripts(session_id);

-- Scheduled interviews: user_id + status (dashboard upcoming)
CREATE INDEX IF NOT EXISTS idx_scheduled_interviews_user_status 
  ON public.scheduled_interviews(user_id, status);

-- Mock tests: user_id + created_at (monthly limit check)
CREATE INDEX IF NOT EXISTS idx_mock_tests_user_created 
  ON public.mock_tests(user_id, created_at DESC);

-- Notifications: user_id + is_read (unread count)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON public.notifications(user_id, is_read);