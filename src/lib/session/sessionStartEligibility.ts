/**
 * Client contract for server-owned session start eligibility + terminal reasons.
 * The backend decides eligibility; this module only maps codes to HTTP/UX.
 */

export const SESSION_ELIGIBILITY_REASONS = [
  "ALLOWED",
  "DAILY_LIMIT_REACHED",
  "CREDITS_EXHAUSTED",
  "CAPABILITY_REQUIRED",
  "ACCOUNT_RESTRICTED",
  "PROVIDER_UNAVAILABLE",
  "AUTHENTICATION_REQUIRED",
] as const;

export type SessionEligibilityReason = (typeof SESSION_ELIGIBILITY_REASONS)[number];

export const SESSION_TERMINAL_REASONS = [
  "USER_ENDED",
  "SESSION_TIMEOUT",
  "AUTH_EXPIRED",
  "DAILY_LIMIT_REACHED",
  "CREDITS_EXHAUSTED",
  "PROVIDER_UNAVAILABLE",
  "ACCOUNT_RESTRICTED",
  "SYSTEM_ERROR",
  "CANCELLED",
  "FAILED",
] as const;

export type SessionTerminalReason = (typeof SESSION_TERMINAL_REASONS)[number];

export type SessionStartEligibility = {
  allowed: boolean;
  reason: SessionEligibilityReason | string;
  used?: number | null;
  limit?: number | null;
  reset_at?: string | null;
  upgrade_available?: boolean;
  credits?: number | null;
};

export function httpStatusForEligibilityReason(reason: string): number {
  switch (reason) {
    case "ALLOWED":
      return 200;
    case "AUTHENTICATION_REQUIRED":
      return 401;
    case "ACCOUNT_RESTRICTED":
    case "CAPABILITY_REQUIRED":
      return 403;
    case "DAILY_LIMIT_REACHED":
      return 429;
    case "CREDITS_EXHAUSTED":
      return 422;
    case "PROVIDER_UNAVAILABLE":
      return 503;
    default:
      return 400;
  }
}

export function eligibilityCodeFromLegacy(code: string | null | undefined): string {
  const value = String(code ?? "").trim();
  switch (value) {
    case "FREE_TIER_SESSION_LIMIT":
    case "daily_session_limit":
    case "DAILY_LIMIT_REACHED":
      return "DAILY_LIMIT_REACHED";
    case "NO_CREDITS":
    case "no_credits":
    case "INSUFFICIENT_CREDITS":
    case "CREDITS_EXHAUSTED":
      return "CREDITS_EXHAUSTED";
    case "ACCOUNT_BANNED":
    case "account_restricted":
    case "ACCOUNT_RESTRICTED":
      return "ACCOUNT_RESTRICTED";
    case "CAPABILITY_REQUIRED":
      return "CAPABILITY_REQUIRED";
    case "PROVIDER_UNAVAILABLE":
      return "PROVIDER_UNAVAILABLE";
    case "UNAUTHORIZED":
    case "AUTHENTICATION_REQUIRED":
      return "AUTHENTICATION_REQUIRED";
    default:
      return value;
  }
}

export function isDailyLimitReason(reason: string | null | undefined): boolean {
  return eligibilityCodeFromLegacy(reason) === "DAILY_LIMIT_REACHED";
}

export function isCreditsExhaustedReason(reason: string | null | undefined): boolean {
  return eligibilityCodeFromLegacy(reason) === "CREDITS_EXHAUSTED";
}

export function formatDailyLimitMessage(input: {
  used?: number | null;
  limit?: number | null;
  reset_at?: string | null;
}): string {
  const limit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : 3;
  const used = Number.isFinite(Number(input.used)) ? Number(input.used) : limit;
  const reset = formatResetAt(input.reset_at);
  const usage = `You've reached today's session limit (${used} of ${limit}).`;
  return reset ? `${usage} Resets ${reset}.` : usage;
}

export function formatResetAt(resetAt: string | null | undefined): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sessionDurationSeconds(input: {
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
}): number {
  if (typeof input.duration_seconds === "number" && Number.isFinite(input.duration_seconds)) {
    return Math.max(0, Math.floor(input.duration_seconds));
  }
  if (!input.started_at || !input.ended_at) return 0;
  const ms = new Date(input.ended_at).getTime() - new Date(input.started_at).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 1000));
}

export function isPracticeSessionExpired(input: {
  expires_at?: string | null;
  status?: string | null;
  lifecycle_status?: string | null;
  terminal_reason?: string | null;
  nowMs?: number;
}): boolean {
  if (input.lifecycle_status === "EXPIRED" || input.terminal_reason === "SESSION_TIMEOUT") {
    return true;
  }
  if (input.expires_at) {
    const expires = new Date(input.expires_at).getTime();
    if (Number.isFinite(expires) && (input.nowMs ?? Date.now()) >= expires) return true;
  }
  return false;
}

export function terminalTitle(reason: string | null | undefined): string {
  switch (reason) {
    case "SESSION_TIMEOUT":
      return "Session expired";
    case "AUTH_EXPIRED":
      return "Signed out";
    case "DAILY_LIMIT_REACHED":
      return "Daily session limit reached";
    case "CREDITS_EXHAUSTED":
      return "Out of credits";
    case "PROVIDER_UNAVAILABLE":
      return "Coach unavailable";
    case "ACCOUNT_RESTRICTED":
      return "Account restricted";
    case "USER_ENDED":
      return "Session ended";
    case "CANCELLED":
      return "Session cancelled";
    case "FAILED":
    case "SYSTEM_ERROR":
      return "Session could not continue";
    default:
      return "Session ended";
  }
}

export function terminalExplanation(reason: string | null | undefined): string {
  switch (reason) {
    case "SESSION_TIMEOUT":
      return "This practice session has expired and can no longer accept new actions.";
    case "AUTH_EXPIRED":
      return "Your sign-in expired. The practice session was not marked complete from this device.";
    case "DAILY_LIMIT_REACHED":
      return "You've reached today's session limit.";
    case "CREDITS_EXHAUSTED":
      return "You don't have enough credits to continue this session.";
    case "PROVIDER_UNAVAILABLE":
      return "The coaching service is temporarily unavailable. Your session was not started.";
    case "ACCOUNT_RESTRICTED":
      return "This account cannot start or continue a practice session right now.";
    case "USER_ENDED":
      return "You ended this practice session.";
    default:
      return "This practice session is no longer active.";
  }
}

export function isAuthExpiryReason(reason: string | null | undefined): boolean {
  return reason === "AUTH_EXPIRED" || reason === "session_expired";
}
