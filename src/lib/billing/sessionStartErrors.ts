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

/** Actionable copy for session-start conflicts (Live Copilot / Practice Coach). */
export const SESSION_START_CONFLICT_MESSAGES: Record<string, string> = {
  SESSION_STATE_CONFLICT:
    "You already have an active Live Copilot session. Reopen the overlay to continue, or end that session before starting a new one.",
  SESSION_NOT_AVAILABLE:
    "This practice session is no longer available. Return to setup and start a new session.",
  PRACTICE_CONTEXT_CONSUMED:
    "This practice setup was already used. Open Session History for the existing session, or create a new setup to start again.",
  SESSION_CREATE_FAILED:
    "Could not create your session. Check your connection, then try again from setup.",
  SESSION_START_FAILED:
    "Could not start your session. Check your connection, then try again from setup.",
};

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

/** True for conflicts / start failures that should surface as user-facing toasts. */
export function isSessionStartConflictError(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === "SESSION_STATE_CONFLICT" ||
    code === "SESSION_NOT_AVAILABLE" ||
    code === "PRACTICE_CONTEXT_CONSUMED" ||
    code === "SESSION_CREATE_FAILED" ||
    code === "SESSION_START_FAILED"
  );
}

export function sessionStartConflictMessage(error: unknown): string {
  const code = errorCode(error);
  if (code && SESSION_START_CONFLICT_MESSAGES[code]) {
    return SESSION_START_CONFLICT_MESSAGES[code];
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not start your session. Please try again in a moment.";
}

/** Dedupe toasts when both useLiveCopilot and LiveOverlay handle the same error. */
let lastToastKey = "";
let lastToastAt = 0;
const TOAST_DEDUPE_MS = 2500;

function toastErrorOnce(key: string, message: string): void {
  const now = Date.now();
  if (key === lastToastKey && now - lastToastAt < TOAST_DEDUPE_MS) return;
  lastToastKey = key;
  lastToastAt = now;
  toast.error(message);
}

/** Returns true when the error was handled (toast and/or upgrade prompt shown). */
export function handleSessionStartError(error: unknown): boolean {
  const rawCode = errorCode(error);
  const code = eligibilityCodeFromLegacy(rawCode || (error instanceof Error ? error.message : ""));
  const details = detailsRecord(error);

  if (isSessionLimitError(error) || isDailyLimitReason(code)) {
    toastErrorOnce(
      `limit:${code}`,
      formatDailyLimitMessage({
        used: Number(details.used ?? details.used_count),
        limit: Number(details.limit),
        reset_at: typeof details.reset_at === "string" ? details.reset_at : null,
      }),
    );
    useUIStore.getState().openUpgradeModal("session_limit");
    return true;
  }

  if (isCreditsExhaustedReason(code) || rawCode === "NO_CREDITS") {
    const message =
      error instanceof ApiClientError
        ? error.message
        : "You have no credits remaining. Upgrade to continue practicing.";
    toastErrorOnce(`credits:${code}`, message);
    useUIStore.getState().openUpgradeModal("out_of_credits");
    return true;
  }

  if (code === "CAPABILITY_REQUIRED") {
    toastErrorOnce("capability", "This session type requires a higher plan.");
    useUIStore.getState().openUpgradeModal("session_limit");
    return true;
  }

  if (code === "ACCOUNT_RESTRICTED" || rawCode === "ACCOUNT_BANNED") {
    toastErrorOnce("restricted", "This account cannot start a session right now.");
    return true;
  }

  if (code === "PROVIDER_UNAVAILABLE" || code === "DEPENDENCY_UNAVAILABLE" || code === "SCHEMA_OUTDATED") {
    toastErrorOnce(
      "provider",
      "The coaching service is temporarily unavailable. Please try again shortly.",
    );
    return true;
  }

  if (code === "SESSION_EXPIRED") {
    toastErrorOnce("expired", "This practice session has expired. Start a new one.");
    return true;
  }

  if (code === "AUTHENTICATION_REQUIRED" || (error instanceof ApiClientError && error.status === 401)) {
    toastErrorOnce("auth", "Please sign in to start a session.");
    return true;
  }

  if (isSessionStartConflictError(error)) {
    toastErrorOnce(`conflict:${rawCode}`, sessionStartConflictMessage(error));
    return true;
  }

  if (error instanceof ApiClientError && (error.status === 502 || error.status === 500 || error.status === 503)) {
    toastErrorOnce(
      `http:${error.status}`,
      "Could not start your session. Please try again in a moment.",
    );
    return true;
  }

  return false;
}
