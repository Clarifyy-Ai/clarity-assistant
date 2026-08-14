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
  if (code === "AI_ERROR" || code === "PROVIDER_UNAVAILABLE") return true;

  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("temporarily unavailable") ||
    msg.includes("credits refunded") ||
    msg.includes("ai_error") ||
    msg.includes("provider_unavailable") ||
    msg.includes("service unavailable")
  );
}

/** Network / CORS / gateway failures that should never name Edge Functions. */
function isUnreachableOrCorsError(err: unknown): boolean {
  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("unreachable") ||
    msg.includes("couldn't reach the server") ||
    msg.includes("could not reach the server") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("cors") ||
    msg.includes("access-control-allow-origin") ||
    msg.includes("load failed")
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

  const quotaMsg = errorText(err).toLowerCase();
  if (
    quotaMsg.includes("insufficient_quota") ||
    quotaMsg.includes("credit_balance_exhausted") ||
    quotaMsg.includes("no credits remaining")
  ) {
    return "This AI model has no remaining API credits. Switch to Gemini Flash.";
  }

  if (isAiTemporarilyUnavailableError(err)) {
    return AI_UNAVAILABLE_MESSAGE;
  }

  if (isUnreachableOrCorsError(err)) {
    return "The AI request did not go through. Please try again.";
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

  if (
    code === "CAPABILITY_REQUIRED" ||
    code === "PLAN_UPGRADE_REQUIRED" ||
    rawLower.includes("requires a higher plan") ||
    (rawLower.includes("requires the") && rawLower.includes("plan"))
  ) {
    return "This feature requires a Pro plan or higher. Upgrade to continue.";
  }

  if (
    code === "BILLING_PAST_DUE" ||
    rawLower.includes("update your payment method")
  ) {
    return "Payment failed. Update your payment method to keep using AI features.";
  }

  if (!raw) {
    return "Something went wrong. Please try again.";
  }

  // Sanitize noisy edge / network wrappers when we only have HTTP fallbacks.
  if (/^Edge Function\b/i.test(raw) || /\bfailed with HTTP\s+\d{3}\b/i.test(raw)) {
    return "Something went wrong. Please try again.";
  }

  if (
    /timed out after\s+\d+ms/i.test(raw) ||
    /the request timed out/i.test(raw) ||
    /\bis unreachable\b/i.test(raw)
  ) {
    return AI_UNAVAILABLE_MESSAGE;
  }

  // Account deletion: never surface function names or CORS jargon.
  if (
    rawLower.includes("account deletion") ||
    rawLower.includes("delete-account")
  ) {
    return "We couldn't complete account deletion right now. Please try again or contact support.";
  }

  return raw;
}

/** True when the plan/capability gate blocked the request (not out of credits). */
export function isCapabilityRequiredError(err: unknown): boolean {
  const status = errorStatus(err);
  const code = errorCode(err).toUpperCase();
  if (code === "CAPABILITY_REQUIRED" || code === "PLAN_REQUIRED" || code === "PLAN_UPGRADE_REQUIRED" || code === "BILLING_PLAN_GATE_BLOCKED") {
    return true;
  }
  if (status === 403) {
    const msg = errorText(err).toLowerCase();
    return msg.includes("upgrade") || msg.includes("plan") || msg.includes("capability");
  }
  return false;
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

export function openUpgradeIfCapabilityRequired(err: unknown): boolean {
  if (!isCapabilityRequiredError(err)) return false;
  try {
    useUIStore.getState().openUpgradeModal("plan_feature");
    return true;
  } catch {
    return false;
  }
}
