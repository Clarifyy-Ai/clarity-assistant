import { ApiClientError } from "@/lib/api/apiClient";
import { BILLING_MESSAGES } from "@/lib/constants/errorMessages";
import { useUIStore } from "@/store/uiStore";
import {
  AI_RESPONSE_INVALID_MESSAGE,
  isRawJsonParseError,
} from "@/lib/ai/structuredParse";

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
  const code = errorCode(err).toUpperCase();
  if (
    code === "MAX_ATTEMPTS_REACHED" ||
    code === "CAPABILITY_REQUIRED" ||
    code === "PLAN_UPGRADE_REQUIRED" ||
    code === "QUESTION_INVENTORY_INSUFFICIENT" ||
    code === "INSUFFICIENT_APPROVED_QUESTIONS" ||
    code === "CONTENT_INSUFFICIENT" ||
    code === "CREDIT_SERVICE_UNAVAILABLE" ||
    code === "PROVIDER_UNAVAILABLE" ||
    code === "ACCOUNT_RESTRICTED" ||
    code === "INVALID_OPERATION"
  ) {
    return false;
  }

  if (
    code === "INSUFFICIENT_CREDITS" ||
    code === "NO_CREDITS" ||
    code === "BILLING_001" ||
    code === "BILL_001"
  ) {
    return true;
  }

  if (code === "PAYMENT_REQUIRED") {
    return true;
  }

  const status = errorStatus(err);
  if (status === 402) {
    // Gateway/provider 402 without explicit credit codes is not a user balance issue.
    if (
      code === "PROVIDER_UNAVAILABLE" ||
      code === "AI_PROVIDER_UNAVAILABLE" ||
      code === "BAD_GATEWAY"
    ) {
      return false;
    }
    return true;
  }

  const msg = errorText(err).toLowerCase();
  return (
    msg.includes("insufficient credits") ||
    msg.includes("out of credits") ||
    msg.includes("no credits")
  );
}

function isAiTemporarilyUnavailableError(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 502 || status === 503) return true;

  const code = errorCode(err).toUpperCase();
  // AUTH failures must never be treated as provider outages.
  if (
    code === "AUTH_EXPIRED" ||
    code === "AUTH_REQUIRED" ||
    code === "AUTH_INVALID" ||
    code === "UNAUTHORIZED"
  ) {
    return false;
  }
  if (
    code === "AI_ERROR" ||
    code === "PROVIDER_UNAVAILABLE" ||
    code === "AI_PROVIDER_UNAVAILABLE" ||
    code === "BAD_GATEWAY"
  ) {
    return true;
  }

  const msg = errorText(err).toLowerCase();
  if (
    msg.includes("auth_expired") ||
    msg.includes("session expired") ||
    msg.includes("sign in again")
  ) {
    return false;
  }
  return (
    msg.includes("temporarily unavailable") ||
    msg.includes("credits refunded") ||
    msg.includes("ai_error") ||
    msg.includes("provider_unavailable") ||
    msg.includes("ai_provider_unavailable") ||
    msg.includes("service unavailable")
  );
}

/** True when the AI provider failed (502/503) — not a credit or validation failure. */
export function isAiProviderUnavailableError(err: unknown): boolean {
  return isAiTemporarilyUnavailableError(err) && !isInsufficientCreditsError(err);
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
  const code = errorCode(err).toUpperCase();
  const details = err instanceof ApiClientError ? (err.details as Record<string, unknown> | undefined) : undefined;
  const balance = Number(details?.balance);
  const cost = Number(details?.cost ?? details?.required);

  if (code === "INSUFFICIENT_CREDITS") {
    if (Number.isFinite(cost) && Number.isFinite(balance)) {
      return `You need ${cost} credits, but only ${balance} are available.`;
    }
    return CREDITS_NEEDED_MESSAGE;
  }

  if (code === "AUTH_EXPIRED" || code === "AUTH_REQUIRED" || code === "AUTH_INVALID") {
    return "Your session expired. Sign in again to continue.";
  }

  if (code === "RATE_LIMITED") {
    return "Too many AI requests right now. Please wait a moment and try again.";
  }

  if (code === "INVALID_RESPONSE" || code === "AI_RESPONSE_INVALID") {
    return AI_RESPONSE_INVALID_MESSAGE;
  }

  if (isInsufficientCreditsError(err) && code !== "PAYMENT_REQUIRED") {
    return CREDITS_NEEDED_MESSAGE;
  }

  if (code === "PAYMENT_REQUIRED") {
    return "Payment is required to continue. Update your billing details or complete checkout.";
  }

  if (code === "MAX_ATTEMPTS_REACHED") {
    const resetAt = typeof details?.resetAt === "string" ? details.resetAt : typeof details?.reset_at === "string" ? details.reset_at : null;
    let resetLabel = "the next reset";
    if (resetAt) {
      const d = new Date(resetAt);
      if (!Number.isNaN(d.getTime())) resetLabel = d.toLocaleString();
    }
    return `You have reached today's attempt limit. Try again after ${resetLabel}.`;
  }

  if (code === "QUESTION_INVENTORY_INSUFFICIENT" || code === "INSUFFICIENT_APPROVED_QUESTIONS" || code === "CONTENT_INSUFFICIENT") {
    const available = Number(details?.available);
    if (Number.isFinite(available)) {
      return `Only ${available} approved questions are available. Try Custom Practice Set.`;
    }
    return "Not enough approved questions are available. Try Custom Practice Set.";
  }

  if (code === "CREDIT_SERVICE_UNAVAILABLE") {
    return "Credits couldn't be verified right now. Please try again.";
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

  if (
    code === "AI_RESPONSE_INVALID" ||
    rawLower.includes("unterminated string") ||
    rawLower.includes("unexpected token") ||
    rawLower.includes("unexpected end of json") ||
    isRawJsonParseError(err)
  ) {
    return AI_RESPONSE_INVALID_MESSAGE;
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
