/**
 * Canonical credit / authorization failure codes.
 * Server is the authority; the UI only maps these codes to copy.
 */

export const CREDIT_ERROR_CODES = [
  "INSUFFICIENT_CREDITS",
  "CREDITS_EXHAUSTED",
  "NO_CREDITS",
  "CAPABILITY_REQUIRED",
  "PLAN_UPGRADE_REQUIRED",
  "MAX_ATTEMPTS_REACHED",
  "PAYMENT_REQUIRED",
  "CREDIT_SERVICE_UNAVAILABLE",
  "ACCOUNT_RESTRICTED",
  "INVALID_OPERATION",
  "PROVIDER_UNAVAILABLE",
  "QUESTION_INVENTORY_INSUFFICIENT",
  "UNKNOWN_OPERATION",
] as const;

export type CreditErrorCode = (typeof CREDIT_ERROR_CODES)[number];

export type CreditDenialDetails = {
  code: CreditErrorCode | string;
  balance?: number;
  cost?: number;
  required?: number;
  shortfall?: number;
  current?: number;
  limit?: number;
  resetAt?: string | null;
  available?: number;
  requested?: number;
};

const INSUFFICIENT_HINTS = [
  "insufficient credits",
  "insufficient funds",
  "no credits",
  "out of credits",
];

export function classifyCreditFailureMessage(
  message: string | null | undefined,
  rpcCode?: string | null,
): CreditErrorCode {
  const code = String(rpcCode ?? "").trim().toUpperCase();
  if (code === "CREDITS_EXHAUSTED" || code === "NO_CREDITS") {
    return "INSUFFICIENT_CREDITS";
  }
  if ((CREDIT_ERROR_CODES as readonly string[]).includes(code)) {
    return code as CreditErrorCode;
  }

  const msg = String(message ?? "").toLowerCase();
  if (!msg) return "CREDIT_SERVICE_UNAVAILABLE";
  if (INSUFFICIENT_HINTS.some((h) => msg.includes(h))) return "INSUFFICIENT_CREDITS";
  if (msg.includes("forbidden") || msg.includes("banned") || msg.includes("restricted")) {
    return "ACCOUNT_RESTRICTED";
  }
  if (msg.includes("invalid") || msg.includes("conflict")) return "INVALID_OPERATION";
  if (msg.includes("profile not found")) return "ACCOUNT_RESTRICTED";
  if (
    msg.includes("does not exist") ||
    msg.includes("could not find the function") ||
    msg.includes("unavailable") ||
    msg.includes("pgrst")
  ) {
    return "CREDIT_SERVICE_UNAVAILABLE";
  }
  return "CREDIT_SERVICE_UNAVAILABLE";
}

export function httpStatusForCreditCode(code: CreditErrorCode | string): number {
  switch (code) {
    case "INSUFFICIENT_CREDITS":
    case "CREDITS_EXHAUSTED":
    case "NO_CREDITS":
    case "PAYMENT_REQUIRED":
      return 402;
    case "CAPABILITY_REQUIRED":
    case "PLAN_UPGRADE_REQUIRED":
    case "ACCOUNT_RESTRICTED":
      return 403;
    case "MAX_ATTEMPTS_REACHED":
      return 429;
    case "QUESTION_INVENTORY_INSUFFICIENT":
      return 409;
    case "INVALID_OPERATION":
    case "UNKNOWN_OPERATION":
      return 400;
    case "PROVIDER_UNAVAILABLE":
    case "CREDIT_SERVICE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

export function creditShortfall(balance: number, cost: number): number {
  const b = Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
  const c = Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : 0;
  return Math.max(0, c - b);
}

export function buildCreditDenialDetails(input: {
  code: CreditErrorCode | string;
  balance?: number | null;
  cost?: number | null;
}): CreditDenialDetails {
  const cost = Number.isFinite(Number(input.cost)) ? Math.max(0, Math.floor(Number(input.cost))) : undefined;
  const balance = Number.isFinite(Number(input.balance))
    ? Math.max(0, Math.floor(Number(input.balance)))
    : undefined;
  const shortfall =
    typeof cost === "number" && typeof balance === "number"
      ? creditShortfall(balance, cost)
      : undefined;
  return {
    code: input.code,
    balance,
    cost,
    required: cost,
    shortfall,
  };
}
