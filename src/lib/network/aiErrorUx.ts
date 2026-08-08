import { ApiClientError } from "@/lib/api/apiClient";
import { BILLING_MESSAGES } from "@/lib/constants/errorMessages";
import { useUIStore } from "@/store/uiStore";

const CREDITS_NEEDED_MESSAGE =
  BILLING_MESSAGES.INSUFFICIENT_CREDITS;

const AI_UNAVAILABLE_MESSAGE =
  "AI is temporarily unavailable. Please try again in a moment.";

function errorText(err: unknown): string {
  if (err instanceof ApiClientError) {
    return [err.message, err.code, String(err.status)].filter(Boolean).join(" ");
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err ?? "");
}

function errorStatus(err: unknown): number | null {
  if (err instanceof ApiClientError && Number.isFinite(err.status)) {
    return err.status;
  }
  const msg = errorText(err);
  const httpMatch = msg.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpMatch) return Number(httpMatch[1]);
  const bare = msg.match(/\b(402|502|503)\b/);
  if (bare) return Number(bare[1]);
  return null;
}

function errorCode(err: unknown): string {
  if (err instanceof ApiClientError && err.code) return err.code;
  return "";
}

/** True when the failure is an out-of-credits / payment-required response. */
export function isInsufficientCreditsError(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 402) return true;

  const code = errorCode(err).toUpperCase();
  if (
    code === "INSUFFICIENT_CREDITS" ||
    code === "PAYMENT_REQUIRED" ||
    code === "NO_CREDITS" ||
    code === "BILLING_001" ||
    code === "BILL_001"
  ) {
    return true;
  }

  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("insufficient credits") ||
    msg.includes("payment_required") ||
    msg.includes("payment required") ||
    msg.includes("out of credits") ||
    msg.includes("no credits")
  );
}

function isAiTemporarilyUnavailableError(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 502 || status === 503) return true;

  const code = errorCode(err).toUpperCase();
  if (code === "AI_ERROR") return true;

  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("temporarily unavailable") ||
    msg.includes("credits refunded") ||
    msg.includes("ai_error") ||
    msg.includes("service unavailable")
  );
}

/**
 * Maps AI / billing edge failures to calm, user-facing copy.
 * Never surfaces raw "Edge Function … HTTP …" when a cleaner message exists.
 */
export function getAiUserFacingError(err: unknown): string {
  if (isInsufficientCreditsError(err)) {
    return CREDITS_NEEDED_MESSAGE;
  }

  if (isAiTemporarilyUnavailableError(err)) {
    return AI_UNAVAILABLE_MESSAGE;
  }

  const raw = errorText(err).trim();
  const rawLower = raw.toLowerCase();
  const code = errorCode(err).toUpperCase();
  // Transient credit ledger races — not "out of credits"; ask for a retry.
  if (
    code === "CREDIT_DEDUCTION_FAILED" ||
    rawLower.includes("credit deduction failed")
  ) {
    return "We couldn't complete that charge. Please try again.";
  }

  if (!raw) {
    return "Something went wrong. Please try again.";
  }

  // Sanitize noisy edge / network wrappers when we only have HTTP fallbacks.
  if (/^Edge Function\b/i.test(raw) || /\bfailed with HTTP\s+\d{3}\b/i.test(raw)) {
    return "Something went wrong. Please try again.";
  }

  if (/timed out after\s+\d+ms/i.test(raw) || /\bis unreachable\b/i.test(raw)) {
    return AI_UNAVAILABLE_MESSAGE;
  }

  return raw;
}

/** Opens the upgrade modal for credit failures when a UI store is available. */
export function openUpgradeIfInsufficientCredits(err: unknown): boolean {
  if (!isInsufficientCreditsError(err)) return false;
  try {
    useUIStore.getState().openUpgradeModal("out_of_credits");
    return true;
  } catch {
    return false;
  }
}
