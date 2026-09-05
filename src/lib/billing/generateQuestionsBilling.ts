/**
 * Client-safe mirror of generate-questions billing rules (keep in sync with Edge).
 */
export type GenerateQuestionsBillingContext = {
  sessionType: string | null;
  hasMockSessionPayment: boolean;
};

export type GenerateQuestionsBillingDecision = {
  creditCharge: number;
  reason:
    | "no_session"
    | "warmup_session"
    | "mock_session_prepaid"
    | "mock_unpaid"
    | "default_paid";
};

export function resolveGenerateQuestionsCreditChargeFromContext(
  ctx: GenerateQuestionsBillingContext,
  perQuestionCost: number,
): GenerateQuestionsBillingDecision {
  const cost = Math.max(0, perQuestionCost);
  if (!ctx.sessionType) {
    return { creditCharge: cost, reason: "no_session" };
  }

  const sessionType = ctx.sessionType.trim().toLowerCase();
  if (sessionType === "warmup") {
    return { creditCharge: 0, reason: "warmup_session" };
  }

  if (sessionType === "mock") {
    if (ctx.hasMockSessionPayment) {
      return { creditCharge: 0, reason: "mock_session_prepaid" };
    }
    return { creditCharge: cost, reason: "mock_unpaid" };
  }

  return { creditCharge: cost, reason: "default_paid" };
}
