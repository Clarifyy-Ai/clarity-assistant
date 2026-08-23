/**
 * Server-authoritative credit denial classification.
 * Never map every deduction failure to PAYMENT_REQUIRED / INSUFFICIENT_CREDITS.
 */
import { getCorsHeaders } from "./cors.ts";

export type CreditErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "CAPABILITY_REQUIRED"
  | "MAX_ATTEMPTS_REACHED"
  | "PAYMENT_REQUIRED"
  | "CREDIT_SERVICE_UNAVAILABLE"
  | "ACCOUNT_RESTRICTED"
  | "INVALID_OPERATION"
  | "PROVIDER_UNAVAILABLE"
  | "QUESTION_INVENTORY_INSUFFICIENT";

export type CreditDenialBody = {
  error: string;
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

function finiteInt(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

export function classifyCreditFailure(
  message: string | null | undefined,
  rpcCode?: string | null,
): CreditErrorCode {
  const code = String(rpcCode ?? "").trim().toUpperCase();
  const known: CreditErrorCode[] = [
    "INSUFFICIENT_CREDITS",
    "CAPABILITY_REQUIRED",
    "MAX_ATTEMPTS_REACHED",
    "PAYMENT_REQUIRED",
    "CREDIT_SERVICE_UNAVAILABLE",
    "ACCOUNT_RESTRICTED",
    "INVALID_OPERATION",
    "PROVIDER_UNAVAILABLE",
    "QUESTION_INVENTORY_INSUFFICIENT",
  ];
  if ((known as string[]).includes(code)) return code as CreditErrorCode;

  const msg = String(message ?? "").toLowerCase();
  if (!msg) return "CREDIT_SERVICE_UNAVAILABLE";
  if (
    msg.includes("insufficient credits") ||
    msg.includes("insufficient funds") ||
    msg.includes("no credits") ||
    msg.includes("out of credits")
  ) {
    return "INSUFFICIENT_CREDITS";
  }
  if (msg.includes("forbidden") || msg.includes("banned") || msg.includes("restricted")) {
    return "ACCOUNT_RESTRICTED";
  }
  if (msg.includes("profile not found")) return "ACCOUNT_RESTRICTED";
  if (msg.includes("invalid") || msg.includes("conflict")) return "INVALID_OPERATION";
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

export function httpStatusForCreditCode(code: string): number {
  switch (code) {
    case "INSUFFICIENT_CREDITS":
    case "PAYMENT_REQUIRED":
      return 402;
    case "CAPABILITY_REQUIRED":
    case "ACCOUNT_RESTRICTED":
      return 403;
    case "MAX_ATTEMPTS_REACHED":
      return 429;
    case "QUESTION_INVENTORY_INSUFFICIENT":
      return 409;
    case "INVALID_OPERATION":
      return 400;
    case "PROVIDER_UNAVAILABLE":
    case "CREDIT_SERVICE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

export function safeCreditMessage(code: string, fallback?: string): string {
  switch (code) {
    case "INSUFFICIENT_CREDITS":
      return fallback && /need|have|available/i.test(fallback)
        ? fallback
        : "Insufficient credits.";
    case "PAYMENT_REQUIRED":
      return "Payment is required to continue.";
    case "CAPABILITY_REQUIRED":
      return "This feature requires a supported plan.";
    case "MAX_ATTEMPTS_REACHED":
      return "You have reached the attempt limit for this plan.";
    case "ACCOUNT_RESTRICTED":
      return "This account cannot perform that action.";
    case "INVALID_OPERATION":
      return "This credit operation is not valid.";
    case "CREDIT_SERVICE_UNAVAILABLE":
      return "Credits couldn't be verified right now. Please try again.";
    case "PROVIDER_UNAVAILABLE":
      return "The exam generation service is temporarily unavailable. Please try again.";
    case "QUESTION_INVENTORY_INSUFFICIENT":
      return "Not enough approved questions are available for this configuration.";
    default:
      return "Credit operation failed.";
  }
}

export function buildCreditDenialBody(
  result: { error?: string; code?: string; balance?: number },
  cost: number,
): CreditDenialBody {
  const code = classifyCreditFailure(result.error, result.code);
  const balance = finiteInt(result.balance);
  const required = finiteInt(cost);
  const shortfall =
    typeof balance === "number" && typeof required === "number"
      ? Math.max(0, required - balance)
      : undefined;
  const body: CreditDenialBody = {
    error: safeCreditMessage(
      code,
      typeof required === "number" && typeof balance === "number" && code === "INSUFFICIENT_CREDITS"
        ? `You need ${required} credits, but only ${balance} are available.`
        : result.error,
    ),
    code,
  };
  if (typeof balance === "number") body.balance = balance;
  if (typeof required === "number") {
    body.cost = required;
    body.required = required;
  }
  if (typeof shortfall === "number") body.shortfall = shortfall;
  return body;
}

export function creditDenialResponse(
  req: Request,
  result: { error?: string; code?: string; balance?: number },
  cost: number,
): Response {
  const body = buildCreditDenialBody(result, cost);
  return new Response(JSON.stringify(body), {
    status: httpStatusForCreditCode(body.code),
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
