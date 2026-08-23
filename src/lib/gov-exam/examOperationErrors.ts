import { ApiClientError } from "@/lib/api/apiClient";
import { getAiUserFacingError } from "@/lib/network/aiErrorUx";
import type { CreditDenialDetails } from "@/lib/billing/creditErrorCodes";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function extractCreditDenialDetails(err: unknown): CreditDenialDetails | null {
  const payload =
    err instanceof ApiClientError
      ? asRecord(err.details) ?? { error: err.message, code: err.code }
      : asRecord(err);
  if (!payload) return null;
  const code = str(payload.code) ?? (err instanceof ApiClientError ? err.code : undefined);
  if (!code) return null;
  return {
    code,
    balance: num(payload.balance),
    cost: num(payload.cost) ?? num(payload.required),
    required: num(payload.required) ?? num(payload.cost),
    shortfall: num(payload.shortfall),
    current: num(payload.current) ?? num(payload.usage),
    limit: num(payload.limit) ?? num(payload.allowed),
    resetAt: str(payload.resetAt) ?? str(payload.reset_at) ?? str(payload.resetTime),
    available: num(payload.available),
    requested: num(payload.requested) ?? num(payload.required),
  };
}

function formatResetTime(resetAt: string | null | undefined): string {
  if (!resetAt) return "the next reset";
  const d = new Date(resetAt);
  if (Number.isNaN(d.getTime())) return "the next reset";
  try {
    return d.toLocaleString();
  } catch {
    return resetAt;
  }
}

export function formatGovExamOperationError(err: unknown): string {
  const details = extractCreditDenialDetails(err);
  const code = (details?.code ?? (err instanceof ApiClientError ? err.code : "")).toUpperCase();

  if (code === "INSUFFICIENT_CREDITS") {
    const cost = details?.cost ?? details?.required;
    const balance = details?.balance;
    if (typeof cost === "number" && typeof balance === "number") {
      return `You need ${cost} credits, but only ${balance} are available.`;
    }
    return "You don't have enough credits for this action. Top up or upgrade your plan.";
  }

  if (code === "MAX_ATTEMPTS_REACHED") {
    return `You have reached today's attempt limit. Try again after ${formatResetTime(details?.resetAt)}.`;
  }

  if (code === "CAPABILITY_REQUIRED" || code === "PLAN_UPGRADE_REQUIRED") {
    return "This feature requires a supported plan.";
  }

  if (code === "PAYMENT_REQUIRED" || code === "BILLING_PAST_DUE") {
    return "Payment is required to continue. Update your billing details or complete checkout.";
  }

  if (code === "PROVIDER_UNAVAILABLE") {
    return "The exam generation service is temporarily unavailable. Please try again.";
  }

  if (code === "CREDIT_SERVICE_UNAVAILABLE") {
    return "Credits couldn't be verified right now. Please try again.";
  }

  if (code === "QUESTION_INVENTORY_INSUFFICIENT" || code === "INSUFFICIENT_APPROVED_QUESTIONS") {
    const available = details?.available;
    const requested = details?.requested;
    if (typeof available === "number" && typeof requested === "number") {
      return `Only ${available} approved questions are available for this configuration.`;
    }
    if (typeof available === "number") {
      return `Only ${available} approved questions are available for this configuration.`;
    }
    return "Not enough approved questions are available for this configuration.";
  }

  if (code === "ACCOUNT_RESTRICTED") {
    return "This account cannot perform that action. Contact support if you need help.";
  }

  const mapped = getAiUserFacingError(err);
  if (/\b(402|502|503|400|429)\b/.test(mapped) || /HTTP\s+\d{3}/i.test(mapped)) {
    return "Something went wrong. Please try again.";
  }
  return mapped;
}
