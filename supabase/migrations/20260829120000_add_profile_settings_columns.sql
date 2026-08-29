-- Migration: Add missing profile settings columns for notification_prefs and privacy_prefs
-- Purpose: Store structured notification and privacy preferences as JSONB
-- Date: 2026-08-29

-- Add JSONB columns if they don't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{
  "email_reminders": true,
  "product_notifications": true,
  "community_notifications": false,
  "session_notifications": true,
  "unsubscribe_all": false
}'::jsonb,
ADD COLUMN IF NOT EXISTS privacy_prefs JSONB DEFAULT '{
  "appearance": "system",
  "data_collection": true,
  "is_leaderboard_visible": true,
  "share_sessions": false
}'::jsonb;

-- Create indexes for these JSONB columns for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_notification_prefs 
  ON public.profiles USING GIN (notification_prefs);

CREATE INDEX IF NOT EXISTS idx_profiles_privacy_prefs 
  ON public.profiles USING GIN (privacy_prefs);

-- Ensure profiles table has proper timezone column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Ensure full_name column exists with proper constraints
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Ensure website_url column exists
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Create a function to validate full_name (used in trigger if needed)
CREATE OR REPLACE FUNCTION validate_full_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.full_name IS NOT NULL THEN
    -- Reject blank/whitespace-only
    IF TRIM(NEW.full_name) = '' THEN
      RAISE EXCEPTION 'Full name cannot be blank or whitespace-only';
    END IF;
    -- Require minimum meaningful length (2 chars after trim)
    IF LENGTH(TRIM(NEW.full_name)) < 2 THEN
      RAISE EXCEPTION 'Full name must be at least 2 characters';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to validate full_name on insert/update
DROP TRIGGER IF EXISTS validate_full_name_trigger ON public.profiles;
CREATE TRIGGER validate_full_name_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION validate_full_name();

-- Grant appropriate permissions
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (
  notification_prefs,
  privacy_prefs,
  timezone,
  full_name,
  website_url,
  bio,
  avatar_url,
  headline,
  experience_years,
  preferred_model,
  preferred_language,
  audio_input_device,
  audio_output_device,
  overlay_hotkey,
  overlay_position,
  overlay_font_size,
  overlay_opacity
) ON public.profiles TO authenticated;
