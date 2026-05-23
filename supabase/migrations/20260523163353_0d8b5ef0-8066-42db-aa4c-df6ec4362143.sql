-- F9: Supporting indexes (Phase 2 quick win from audit).
-- Note: unique (subject, md5(question_text)) index intentionally skipped — pre-existing
-- duplicates are referenced by test_responses and other child tables. Dedupe is
-- enforced application-side in generate-practice-questions instead.

CREATE INDEX IF NOT EXISTS questions_subject_topic_difficulty_idx
  ON public.questions (subject, topic, difficulty);

CREATE INDEX IF NOT EXISTS sessions_user_created_idx
  ON public.sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mock_tests_user_status_idx
  ON public.mock_tests (user_id, status);