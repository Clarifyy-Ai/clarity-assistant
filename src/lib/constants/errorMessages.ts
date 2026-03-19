// ─────────────────────────────────────────────────────────────────────────────
// errorMessages.ts — All user-facing error and success message strings.
// Centralised so copy changes happen in one place, never in components.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const AUTH_MESSAGES = {
  // Errors
  INVALID_CREDENTIALS:      "Incorrect email or password. Please try again.",
  EMAIL_NOT_VERIFIED:       "Please verify your email address before signing in.",
  ACCOUNT_DISABLED:         "Your account has been disabled. Contact support for help.",
  SESSION_EXPIRED:          "Your session has expired. Please sign in again.",
  NOT_AUTHENTICATED:        "You must be signed in to access this page.",
  OAUTH_FAILED:             "Social sign-in failed. Please try again or use email.",
  SIGNUP_EMAIL_TAKEN:       "An account with this email already exists. Try signing in.",
  SIGNUP_WEAK_PASSWORD:     "Your password is too weak. Please use at least 8 characters.",
  PASSWORD_RESET_SENT:      "Password reset email sent. Check your inbox.",
  PASSWORD_RESET_FAILED:    "Failed to reset password. The link may have expired.",
  PASSWORD_UPDATED:         "Password updated successfully.",
  EMAIL_VERIFY_RESENT:      "Verification email sent. Please check your inbox.",
  PROFILE_UPDATED:          "Profile updated successfully.",
  SIGN_OUT_SUCCESS:         "You've been signed out.",
  SIGN_OUT_FAILED:          "Sign out failed. Please try again.",
  DELETE_ACCOUNT_SUCCESS:   "Your account has been permanently deleted.",
} as const;

// ─── Billing ──────────────────────────────────────────────────────────────────

export const BILLING_MESSAGES = {
  INSUFFICIENT_CREDITS:     "You don't have enough credits for this action. Top up or upgrade your plan.",
  PLAN_GATE_BLOCKED:        "This feature requires a higher plan. Upgrade to unlock it.",
  CHECKOUT_FAILED:          "Failed to start checkout. Please try again.",
  SUBSCRIPTION_CANCELLED:   "Your subscription will end at the current billing period.",
  SUBSCRIPTION_RESUMED:     "Your subscription has been reactivated.",
  CREDITS_PURCHASED:        "Credits added to your account.",
  CREDITS_DEDUCTED:         (amount: number) => `${amount} credit${amount === 1 ? "" : "s"} used.`,
  PLAN_UPGRADED:            (plan: string) => `Successfully upgraded to ${plan}.`,
  PLAN_DOWNGRADED:          (plan: string) => `Your plan will change to ${plan} at period end.`,
  STRIPE_ERROR:             "Payment provider error. Please try again or contact support.",
  FREE_LIMIT_REACHED:       "You've reached the free plan limit. Upgrade to continue.",
} as const;

// ─── Audio ────────────────────────────────────────────────────────────────────

export const AUDIO_MESSAGES = {
  MIC_PERMISSION_DENIED:    "Microphone access was denied. Enable it in browser settings.",
  MIC_NOT_FOUND:            "No microphone detected. Connect one and try again.",
  MIC_IN_USE:               "Microphone is in use by another application.",
  STREAM_FAILED:            "Failed to access audio. Please check your device settings.",
  STREAM_ENDED:             "Audio stream ended unexpectedly. Session paused.",
  NOT_SECURE_CONTEXT:       "Microphone requires a secure connection (HTTPS).",
  BROWSER_UNSUPPORTED:      "Your browser doesn't support audio capture. Use Chrome or Firefox.",
  DEEPGRAM_DISCONNECTED:    "Transcription service disconnected. Attempting to reconnect…",
  DEEPGRAM_TOKEN_FAILED:    "Failed to get transcription token. Please reload.",
  DEEPGRAM_RECONNECTED:     "Transcription service reconnected.",
  AUDIO_CLIPPING:           "Microphone volume is too high. Lower your input level.",
  AUDIO_SILENT:             "No audio detected. Check your microphone is not muted.",
  PREFLIGHT_PASSED:         "Audio ready. You're good to go!",
  PREFLIGHT_FAILED:         "Audio setup incomplete. Check the errors above.",
} as const;

// ─── AI ───────────────────────────────────────────────────────────────────────

export const AI_MESSAGES = {
  GENERATING:               "Generating response…",
  GENERATION_FAILED:        "AI generation failed. Please try again.",
  MODEL_UNAVAILABLE:        "Selected AI model is unavailable. Switching to fallback.",
  RATE_LIMITED:             "Too many requests. Please wait a moment before trying again.",
  CONTEXT_TOO_LONG:         "Input is too long for the selected model. It has been trimmed.",
  BYOK_INVALID:             "API key is invalid. Please check it in Settings > AI.",
  BYOK_SAVED:               "API key saved successfully.",
  OFFLINE_FALLBACK:         "You're offline. Using a pre-built answer template.",
  ANSWER_COPIED:            "Answer copied to clipboard.",
  ANSWER_SAVED:             "Answer saved to your answer bank.",
  ANSWER_DELETED:           "Answer removed from your answer bank.",
  FEEDBACK_GENERATED:       "Feedback ready.",
  DEBRIEF_GENERATED:        "Session debrief ready.",
  NO_QUESTION_DETECTED:     "No question detected yet. Ask an interview question to get started.",
  STREAM_INTERRUPTED:       "Answer stream interrupted. Partial response shown.",
} as const;

// ─── Session ──────────────────────────────────────────────────────────────────

export const SESSION_MESSAGES = {
  STARTED:                  "Session started. Good luck!",
  ENDED:                    "Session ended. Great work!",
  PAUSED:                   "Session paused.",
  RESUMED:                  "Session resumed.",
  SAVED:                    "Session saved.",
  SAVE_FAILED:              "Failed to save session. Your data may not be synced.",
  DELETED:                  "Session deleted.",
  DELETE_FAILED:            "Failed to delete session.",
  ALREADY_ACTIVE:           "A session is already active. End it before starting a new one.",
  NOT_FOUND:                "Session not found.",
  SYNC_FAILED:              "Failed to sync session to cloud. Working offline.",
  TRANSCRIPT_SAVED:         "Transcript saved.",
  SCREENSHOT_CAPTURED:      "Screenshot captured.",
  SCREENSHOT_FAILED:        "Failed to capture screenshot.",
} as const;

// ─── Network ──────────────────────────────────────────────────────────────────

export const NETWORK_MESSAGES = {
  OFFLINE:                  "You're offline. Some features may not work.",
  BACK_ONLINE:              "Back online. Syncing your data…",
  REQUEST_FAILED:           "Request failed. Check your connection and try again.",
  REQUEST_TIMEOUT:          "Request timed out. Please try again.",
  RATE_LIMITED:             "Too many requests. Please slow down.",
  SERVER_ERROR:             "Server error. Our team has been notified.",
  WEBSOCKET_CLOSED:         "Connection closed. Attempting to reconnect…",
  WEBSOCKET_RECONNECTED:    "Connection restored.",
  WEBSOCKET_MAX_RETRIES:    "Connection failed after multiple attempts. Please reload.",
} as const;

// ─── Storage / Upload ─────────────────────────────────────────────────────────

export const STORAGE_MESSAGES = {
  UPLOAD_SUCCESS:           "File uploaded successfully.",
  UPLOAD_FAILED:            "Upload failed. Please try again.",
  UPLOAD_TOO_LARGE:         (maxMB: number) => `File is too large. Maximum size is ${maxMB}MB.`,
  INVALID_FILE_TYPE:        "File type not supported.",
  DOWNLOAD_FAILED:          "Failed to download file.",
  DELETE_SUCCESS:           "File deleted.",
  DELETE_FAILED:            "Failed to delete file.",
  RESUME_PARSED:            "Resume parsed successfully.",
  RESUME_PARSE_FAILED:      "Could not read resume. Please ensure it's a text-based PDF.",
} as const;

// ─── Settings ─────────────────────────────────────────────────────────────────

export const SETTINGS_MESSAGES = {
  SAVED:                    "Settings saved.",
  SAVE_FAILED:              "Failed to save settings. Please try again.",
  RESET_TO_DEFAULTS:        "Settings reset to defaults.",
  HOTKEY_CONFLICT:          (key: string) => `"${key}" is already used by another shortcut.`,
  HOTKEY_SAVED:             "Hotkey updated.",
  THEME_CHANGED:            (theme: string) => `Theme changed to ${theme}.`,
} as const;

// ─── Generic / Fallbacks ──────────────────────────────────────────────────────

export const GENERIC_MESSAGES = {
  LOADING:                  "Loading…",
  SAVING:                   "Saving…",
  DELETING:                 "Deleting…",
  PROCESSING:               "Processing…",
  UNKNOWN_ERROR:            "Something went wrong. Please try again.",
  COPIED:                   "Copied to clipboard.",
  COPY_FAILED:              "Failed to copy. Please copy manually.",
  COMING_SOON:              "This feature is coming soon.",
  NO_DATA:                  "No data yet.",
  CONFIRM_DELETE:           "Are you sure? This cannot be undone.",
  PERMISSION_DENIED:        "You don't have permission to do that.",
  NOT_FOUND:                "Not found.",
  FEATURE_UNAVAILABLE:      "This feature is not available on your current plan.",
} as const;

// ─── Toast Helpers ────────────────────────────────────────────────────────────

export type ToastSeverity = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  message:   string;
  severity:  ToastSeverity;
  duration?: number;  // ms
}

export function successToast(message: string, duration = 3000): ToastMessage {
  return { message, severity: "success", duration };
}

export function errorToast(message: string, duration = 5000): ToastMessage {
  return { message, severity: "error", duration };
}

export function warnToast(message: string, duration = 4000): ToastMessage {
  return { message, severity: "warning", duration };
}

export function infoToast(message: string, duration = 3000): ToastMessage {
  return { message, severity: "info", duration };
}
