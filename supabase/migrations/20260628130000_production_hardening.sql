-- Production Hardening Migration
-- Adds performance indexes, soft-delete support, retention cleanup,
-- PII documentation, and free-tier enforcement.

--------------------------------------------------------------------------------
-- 1. Performance indexes
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_answers_session ON session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_session_transcripts_session ON session_transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_date ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_type ON documents(user_id, type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mock_tests_user ON mock_tests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category, difficulty);
CREATE INDEX IF NOT EXISTS idx_answer_bank_user ON answer_bank(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_type_tags ON sessions(type, user_id) WHERE type = 'live';

--------------------------------------------------------------------------------
-- 2. Soft-delete support
--------------------------------------------------------------------------------

ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE answer_bank ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_active ON documents(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_answer_bank_active ON answer_bank(user_id) WHERE deleted_at IS NULL;

--------------------------------------------------------------------------------
-- 3. Document retention enforcement function
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cleanup_expired_documents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH expired AS (
    DELETE FROM documents
    WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM expired;
  
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_expired_documents() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cleanup_expired_documents() FROM authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_documents() TO service_role;

--------------------------------------------------------------------------------
-- 4. PII field documentation
--------------------------------------------------------------------------------

COMMENT ON COLUMN profiles.full_name IS 'PII: User display name. Include in GDPR export. Purge on account deletion.';
COMMENT ON COLUMN profiles.email IS 'PII: Primary contact. Include in GDPR export. Purge on account deletion.';
COMMENT ON COLUMN profiles.avatar_url IS 'PII: Profile image URL. Purge on account deletion.';
COMMENT ON COLUMN documents.file_url IS 'PII: Contains resume/cover letter. Purge storage object on deletion.';
COMMENT ON COLUMN session_transcripts.content IS 'PII: Speech transcript. Subject to retention policy. Purge after 30 days or on deletion.';

--------------------------------------------------------------------------------
-- 5. Free-tier enforcement (server-side)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_free_tier_limits(p_user_id UUID, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_plan TEXT;
  v_credits INTEGER;
  v_sessions_today INTEGER;
  v_documents INTEGER;
BEGIN
  SELECT plan_id, credits INTO v_plan, v_credits
  FROM profiles WHERE id = p_user_id;

  IF v_plan IS NOT NULL AND v_plan != 'free' THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  IF v_credits <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_credits', 'message', 'You have no credits remaining. Upgrade to Pro for 2,000 credits/month.');
  END IF;

  IF p_action = 'start_session' THEN
    SELECT COUNT(*) INTO v_sessions_today
    FROM sessions
    WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '1 day';
    
    IF v_sessions_today >= 3 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'daily_session_limit', 'message', 'Free plan allows 3 sessions per day. Upgrade to Pro for unlimited sessions.');
    END IF;
  END IF;

  IF p_action = 'upload_document' THEN
    SELECT COUNT(*) INTO v_documents
    FROM documents
    WHERE user_id = p_user_id AND deleted_at IS NULL;
    
    IF v_documents >= 5 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'document_limit', 'message', 'Free plan allows 5 documents. Upgrade to Pro for unlimited storage.');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION check_free_tier_limits(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_free_tier_limits(UUID, TEXT) TO service_role;
