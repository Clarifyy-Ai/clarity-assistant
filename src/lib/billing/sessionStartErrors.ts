import { ApiClientError } from "@/lib/api/apiClient";
import { useUIStore } from "@/store/uiStore";
import { toast } from "sonner";
import {
  eligibilityCodeFromLegacy,
  formatDailyLimitMessage,
  isCreditsExhaustedReason,
  isDailyLimitReason,
} from "@/lib/session/sessionStartEligibility";

export const SESSION_LIMIT_ERROR_CODES = new Set([
  "FREE_TIER_SESSION_LIMIT",
  "daily_session_limit",
  "DAILY_LIMIT_REACHED",
]);

function errorCode(error: unknown): string {
  if (error instanceof ApiClientError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: string }).code ?? "");
  }
  return "";
}

function detailsRecord(error: unknown): Record<string, unknown> {
  if (error instanceof ApiClientError && error.details && typeof error.details === "object") {
    return error.details as Record<string, unknown>;
  }
  return {};
}

export function isSessionLimitError(error: unknown): boolean {
  const code = eligibilityCodeFromLegacy(errorCode(error));
  if (isDailyLimitReason(code) || SESSION_LIMIT_ERROR_CODES.has(errorCode(error))) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("session limit") || msg.includes("sessions per day");
  }
  return false;
}

/** Returns true when the error was handled (upgrade prompt shown). */
export function handleSessionStartError(error: unknown): boolean {
  const code = eligibilityCodeFromLegacy(errorCode(error) || (error instanceof Error ? error.message : ""));
  const details = detailsRecord(error);

  if (isSessionLimitError(error) || isDailyLimitReason(code)) {
    toast.error(
      formatDailyLimitMessage({
        used: Number(details.used ?? details.used_count),
        limit: Number(details.limit),
        reset_at: typeof details.reset_at === "string" ? details.reset_at : null,
      }),
    );
    useUIStore.getState().openUpgradeModal("session_limit");
    return true;
  }

  if (isCreditsExhaustedReason(code) || errorCode(error) === "NO_CREDITS") {
    const message =
      error instanceof ApiClientError
        ? error.message
        : "You have no credits remaining. Upgrade to continue practicing.";
    toast.error(message);
    useUIStore.getState().openUpgradeModal("out_of_credits");
    return true;
  }

  if (code === "CAPABILITY_REQUIRED") {
    toast.error("This session type requires a higher plan.");
    useUIStore.getState().openUpgradeModal("session_limit");
    return true;
  }

  if (code === "ACCOUNT_RESTRICTED" || errorCode(error) === "ACCOUNT_BANNED") {
    toast.error("This account cannot start a session right now.");
    return true;
  }

  if (code === "PROVIDER_UNAVAILABLE" || code === "DEPENDENCY_UNAVAILABLE" || code === "SCHEMA_OUTDATED") {
    toast.error("The coaching service is temporarily unavailable. Please try again shortly.");
    return true;
  }

  if (code === "SESSION_EXPIRED") {
    toast.error("This practice session has expired. Start a new one.");
    return true;
  }

  if (code === "AUTHENTICATION_REQUIRED" || (error instanceof ApiClientError && error.status === 401)) {
    toast.error("Please sign in to start a session.");
    return true;
  }

  if (
    error instanceof ApiClientError &&
    (error.code === "SESSION_CREATE_FAILED" ||
      error.code === "SESSION_START_FAILED" ||
      error.code === "SESSION_NOT_AVAILABLE" ||
      error.code === "SESSION_STATE_CONFLICT")
  ) {
    toast.error(
      "Could not start your session. Please try again in a moment. If this keeps happening, contact support.",
    );
    return true;
  }

  if (error instanceof ApiClientError && (error.status === 502 || error.status === 500 || error.status === 503)) {
    toast.error("Could not start your session. Please try again in a moment.");
    return true;
  }

  return false;
}
