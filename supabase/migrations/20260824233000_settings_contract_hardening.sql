-- Canonical persisted settings used by the Settings UI and Edge functions.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS experience_years integer,
  ADD COLUMN IF NOT EXISTS overlay_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hint_style text NOT NULL DEFAULT 'short_hints',
  ADD COLUMN IF NOT EXISTS coach_tone text NOT NULL DEFAULT 'encouraging',
  ADD COLUMN IF NOT EXISTS stt_language text NOT NULL DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS custom_filler_words text[] NOT NULL DEFAULT
    ARRAY['um','uh','like','you know','basically','literally','so','right']::text[],
  ADD COLUMN IF NOT EXISTS auto_gain boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS noise_suppression boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS audio_input_device text,
  ADD COLUMN IF NOT EXISTS audio_output_device text,
  ADD COLUMN IF NOT EXISTS ui_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT
    '{"session_complete":true,"credit_low":true,"product_updates":false,"debrief_ready":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS session_reminders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketing_emails boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_prefs jsonb NOT NULL DEFAULT
    '{"allow_ai_training":false,"store_transcripts":true,"analytics_tracking":true,"crash_reporting":true,"share_scorecard":true}'::jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_hint_style_check,
  DROP CONSTRAINT IF EXISTS profiles_coach_tone_check,
  DROP CONSTRAINT IF EXISTS profiles_stt_language_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_hint_style_check
    CHECK (hint_style IN ('short_hints','keywords_only','full_answer')),
  ADD CONSTRAINT profiles_coach_tone_check
    CHECK (coach_tone IN ('encouraging','direct','formal','casual')),
  ADD CONSTRAINT profiles_stt_language_check
    CHECK (stt_language IN ('en-US','en-GB','en-IN','en-AU','fr-FR','de-DE','es-ES','pt-BR'));

-- Notifications are authoritative server records; clients may only read and
-- mutate their own read/delete state through the existing scoped policies.
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
REVOKE INSERT ON public.notifications FROM authenticated;
