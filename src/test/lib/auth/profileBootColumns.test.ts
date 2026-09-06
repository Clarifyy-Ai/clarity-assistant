import { describe, expect, it } from "vitest";
import { PROFILE_BOOT_COLUMNS } from "@/lib/supabase/database";
import { isNonRetryableAuthError, isSchemaConfigError } from "@/lib/auth/sessionErrors";

describe("PROFILE_BOOT_COLUMNS", () => {
  it("does not select dropped profiles.is_admin (roles live in user_roles)", () => {
    const cols = PROFILE_BOOT_COLUMNS.split(",").map((c) => c.trim());
    expect(cols).not.toContain("is_admin");
    expect(cols).toEqual(
        expect.arrayContaining([
        "id",
        "email",
        "full_name",
        "credits",
        "plan_id",
        "is_banned",
        "onboarding_completed",
        "mfa_reenrollment_required",
        "ui_preferences",
        "overlay_settings",
        "stt_language",
        "custom_filler_words",
        "auto_gain",
        "noise_suppression",
        "audio_input_device",
        "audio_output_device",
        "preferred_model",
        "hint_style",
        "coach_tone",
        "bio",
        "website_url",
        "timezone",
        "experience_years",
        "target_role",
        "notification_prefs",
        "email_notifications",
        "session_reminders",
        "marketing_emails",
      ]),
    );
  });
});

describe("schema config auth errors", () => {
  it("treats missing-column PostgREST errors as non-retryable", () => {
    const err = new Error("column profiles.is_admin does not exist");
    expect(isSchemaConfigError(err)).toBe(true);
    expect(isNonRetryableAuthError(err)).toBe(true);
  });
});
