-- Harden check_free_tier_limits: prevent IDOR by requiring auth.uid() = p_user_id.
-- Server-side edge functions use service_role; authenticated callers may only
-- query their own limits.

CREATE OR REPLACE FUNCTION check_free_tier_limits(p_user_id UUID, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_credits INTEGER;
  v_sessions_today INTEGER;
  v_documents INTEGER;
BEGIN
  -- Reject cross-user lookups from authenticated JWT callers.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'forbidden',
      'message', 'Cannot check limits for another user.'
    );
  END IF;

  SELECT plan_id, credits INTO v_plan, v_credits
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'user_not_found',
      'message', 'User profile not found.'
    );
  END IF;

  IF v_plan IS NOT NULL AND v_plan != 'free' THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  IF v_credits <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_credits',
      'message', 'You have no credits remaining. Upgrade to Pro for 2,000 credits/month.'
    );
  END IF;

  IF p_action = 'start_session' THEN
    SELECT COUNT(*) INTO v_sessions_today
    FROM sessions
    WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '1 day';

    IF v_sessions_today >= 3 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'daily_session_limit',
        'message', 'Free plan allows 3 sessions per day. Upgrade to Pro for unlimited sessions.'
      );
    END IF;
  END IF;

  IF p_action = 'upload_document' THEN
    SELECT COUNT(*) INTO v_documents
    FROM documents
    WHERE user_id = p_user_id AND deleted_at IS NULL;

    IF v_documents >= 5 THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'document_limit',
        'message', 'Free plan allows 5 documents. Upgrade to Pro for unlimited storage.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION check_free_tier_limits(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_free_tier_limits(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION check_free_tier_limits(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_free_tier_limits(UUID, TEXT) TO service_role;
