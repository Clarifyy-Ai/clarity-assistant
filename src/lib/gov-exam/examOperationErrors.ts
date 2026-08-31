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

function inventoryShortageMessage(available: number | undefined): string {
  if (typeof available === "number") {
    return `Only ${available} approved questions are available. Try Custom Practice Set.`;
  }
  return "Not enough approved questions are available. Try Custom Practice Set.";
}

/** Soften blunt / internal failure copy before it reaches the UI. */
function sanitizeGovFacingMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "We couldn't generate this paper. Try again.";
  if (/\bai failed\b/i.test(trimmed) || /^generation failed\.?$/i.test(trimmed) || /^failed\.?$/i.test(trimmed)) {
    return "We couldn't generate this paper. Try again.";
  }
  if (/\b(402|502|503|400|429)\b/.test(trimmed) || /HTTP\s+\d{3}/i.test(trimmed)) {
    return "Something went wrong. Please try again.";
  }
  return trimmed;
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

  if (
    code === "QUESTION_INVENTORY_INSUFFICIENT" ||
    code === "INSUFFICIENT_APPROVED_QUESTIONS" ||
    code === "CONTENT_INSUFFICIENT"
  ) {
    return inventoryShortageMessage(details?.available);
  }

  if (
    code === "GENERATION_CONFLICT" ||
    code === "EXAM_NOT_AVAILABLE" ||
    code === "EXAM_VERSION_NOT_APPROVED" ||
    code === "INVALID_CONFIGURATION" ||
    code === "PATTERN_NOT_AVAILABLE" ||
    code === "SYLLABUS_NOT_AVAILABLE"
  ) {
    const msg = err instanceof ApiClientError ? err.message : str(asRecord(err)?.error);
    return sanitizeGovFacingMessage(msg ?? "This exam configuration is not available.");
  }

  if (code === "INVALID_QUESTION_COUNT" || code === "INVALID_COUNT") {
    return "Enter a whole number between 5 and 100 questions.";
  }

  if (code === "NO_RESULTS") {
    return "No exams matched that search. Try another name or recruiting body.";
  }

  if (code === "LANGUAGE_UNAVAILABLE" || code === "LANGUAGE_NOT_SUPPORTED") {
    return "This exam paper is not available in the selected language.";
  }

  if (code === "JOB_NOT_FOUND") {
    return "We couldn't find that generation job. Refresh and try again.";
  }

  if (code === "PYTHON_UNAVAILABLE" || code === "PYTHON_NOT_CONFIGURED") {
    return "The exam generation service is temporarily unavailable. Please try again.";
  }

  if (code === "AI_UNAVAILABLE" || code === "PROVIDER_UNAVAILABLE") {
    return "AI generation is unavailable. We'll use the approved bank when possible.";
  }

  if (code === "PAPER_VALIDATION_FAILED") {
    return "The paper did not pass validation. No unofficial questions were added to fill the gap.";
  }

  if (code === "ATTEMPT_EXPIRED") {
    return "Time is up. Your answers were submitted automatically.";
  }

  if (code === "ATTEMPT_NOT_STARTED") {
    return "Start the exam before saving or submitting answers.";
  }

  if (code === "SUBMISSION_CONFLICT") {
    return "This exam is already submitted. Open your results instead.";
  }

  if (code === "JOB_TERMINAL_FAILURE") {
    return "Paper generation failed. Credits were not kept. You can retry.";
  }

  if (code === "REGION_RESTRICTED") {
    return "Government exams are available for India accounts.";
  }

  if (code === "GENERATION_CONFLICT") {
    return "A paper is already being generated. Wait for it to finish or open the existing job.";
  }

  if (code === "RATE_LIMITED") {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (code === "RATE_LIMIT_BACKEND_UNAVAILABLE") {
    return "The exam service is briefly unavailable. Please try again.";
  }

  if (code === "ACCOUNT_RESTRICTED") {
    return "This account cannot perform that action. Contact support if you need help.";
  }

  const mapped = sanitizeGovFacingMessage(getAiUserFacingError(err));
  return mapped;
}
