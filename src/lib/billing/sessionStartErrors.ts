import { ApiClientError } from "@/lib/api/apiClient";
import { useUIStore } from "@/store/uiStore";
import { toast } from "sonner";

export const SESSION_LIMIT_ERROR_CODES = new Set([
  "FREE_TIER_SESSION_LIMIT",
  "daily_session_limit",
]);

export function isSessionLimitError(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    if (SESSION_LIMIT_ERROR_CODES.has(error.code)) return true;
    const msg = error.message.toLowerCase();
    return msg.includes("session limit") || msg.includes("sessions per day");
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("session limit") || msg.includes("sessions per day");
  }

  return false;
}

/** Returns true when the error was handled (upgrade prompt shown). */
export function handleSessionStartError(error: unknown): boolean {
  if (isSessionLimitError(error)) {
    const resetAt = new Date();
    resetAt.setHours(24, 0, 0, 0);
    const message = `Daily session limit reached — you've used all your free sessions for today. Upgrade or come back tomorrow at ${resetAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    toast.error(message);
    useUIStore.getState().openUpgradeModal("session_limit");
    return true;
  }

  if (error instanceof ApiClientError && error.code === "NO_CREDITS") {
    toast.error(error.message);
    useUIStore.getState().openUpgradeModal("out_of_credits");
    return true;
  }

  if (error instanceof ApiClientError && error.code === "SESSION_CREATE_FAILED") {
    toast.error(
      "Could not start your session. Please try again in a moment. If this keeps happening, contact support.",
    );
    return true;
  }

  return false;
}
