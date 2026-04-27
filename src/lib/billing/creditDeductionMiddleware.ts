// src/lib/billing/creditDeductionMiddleware.ts
// Wraps AI actions with credit deduction logic. [file:1][file:3]

import type { CreditAction, CreditDeductionResult } from "./creditsManager";
import { deductCreditsForAction, openUpgradeFlow } from "./creditsManager";

/**
 * Wrap a paid AI action so it always:
 *  - deducts credits securely via Edge Function
 *  - triggers upgrade flow on insufficient credits
 *  - returns both the AI result and billing metadata. [file:1][file:3]
 */
export async function withCreditDeduction<T>(
  action: CreditAction,
  sessionId: string | undefined,
  fn: () => Promise<T>,
): Promise<{
  result: T | null;
  billing: CreditDeductionResult;
}> {
  // First deduct credits. If this fails, do not call the AI. [file:1]
  const billing = await deductCreditsForAction(action, sessionId);

  if (!billing.success) {
    if (
      billing.error &&
      billing.error.toLowerCase().includes("insufficient")
    ) {
      openUpgradeFlow("out_of_credits");
    }
    return { result: null, billing };
  }

  const result = await fn();
  return { result, billing };
}
