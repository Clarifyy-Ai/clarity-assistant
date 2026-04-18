-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Add retention column to profiles (default 90 days, min 7, max 3650)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS data_retention_days INTEGER NOT NULL DEFAULT 90
    CHECK (data_retention_days >= 7 AND data_retention_days <= 3650);

-- 2. Cleanup function — runs as definer to bypass RLS for service-side deletion.
--    Iterates per-user and uses each profile's configured retention window.
CREATE OR REPLACE FUNCTION public.delete_expired_session_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessions_deleted          INTEGER := 0;
  v_transcripts_deleted       INTEGER := 0;
  v_session_transcripts_deleted INTEGER := 0;
  v_answers_deleted           INTEGER := 0;
  v_ai_interactions_deleted   INTEGER := 0;
  v_debriefs_deleted          INTEGER := 0;
BEGIN
  -- Delete child rows first (they reference sessions). Use per-user retention.

  -- session_transcripts
  WITH del AS (
    DELETE FROM public.session_transcripts st
    USING public.profiles p
    WHERE st.user_id = p.id
      AND st.created_at < (NOW() - (p.data_retention_days || ' days')::interval)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_session_transcripts_deleted FROM del;

  -- transcripts (legacy)
  WITH del AS (
    DELETE FROM public.transcripts t
    USING public.profiles p
    WHERE t.user_id = p.id
      AND t.created_at < (NOW() - (p.data_retention_days || ' days')::interval)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_transcripts_deleted FROM del;

  -- session_answers
  WITH del AS (
    DELETE FROM public.session_answers sa
    USING public.profiles p
    WHERE sa.user_id = p.id
      AND sa.created_at < (NOW() - (p.data_retention_days || ' days')::interval)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_answers_deleted FROM del;

  -- session_ai_interactions
  WITH del AS (
    DELETE FROM public.session_ai_interactions ai
    USING public.profiles p
    WHERE ai.user_id = p.id
      AND ai.created_at < (NOW() - (p.data_retention_days || ' days')::interval)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_ai_interactions_deleted FROM del;

  -- session_debriefs
  WITH del AS (
    DELETE FROM public.session_debriefs sd
    USING public.profiles p
    WHERE sd.user_id = p.id
      AND sd.created_at < (NOW() - (p.data_retention_days || ' days')::interval)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_debriefs_deleted FROM del;

  -- sessions (parent — delete last)
  WITH del AS (
    DELETE FROM public.sessions s
    USING public.profiles p
    WHERE s.user_id = p.id
      AND s.created_at < (NOW() - (p.data_retention_days || ' days')::interval)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_sessions_deleted FROM del;

  RETURN jsonb_build_object(
    'success',                      true,
    'sessions_deleted',             v_sessions_deleted,
    'session_transcripts_deleted',  v_session_transcripts_deleted,
    'transcripts_deleted',          v_transcripts_deleted,
    'answers_deleted',              v_answers_deleted,
    'ai_interactions_deleted',      v_ai_interactions_deleted,
    'debriefs_deleted',             v_debriefs_deleted,
    'ran_at',                       NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Restrict execution: only postgres / service_role should call this directly.
REVOKE ALL ON FUNCTION public.delete_expired_session_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_expired_session_data() FROM authenticated;
REVOKE ALL ON FUNCTION public.delete_expired_session_data() FROM anon;

-- 3. Schedule daily cleanup at 03:00 UTC
DO $$
BEGIN
  -- Unschedule any prior version of the job
  PERFORM cron.unschedule('delete-expired-session-data-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-expired-session-data-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'delete-expired-session-data-daily',
  '0 3 * * *',
  $$ SELECT public.delete_expired_session_data(); $$
);