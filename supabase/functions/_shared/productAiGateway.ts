/**
 * Product AI gateway — thin facade for new Edge features.
 * New metered AI endpoints should import from here instead of wiring providers directly.
 */
import {
  generateWithFallback,
  type AIProviderOptions,
  type AIProviderResult,
} from "./aiProvider.ts";
import {
  createServiceClient,
  deductCreditsAtomic,
  refundCredits,
} from "./supabase.ts";

export type MeteredAiCallInput = {
  userId: string;
  creditAction: string;
  creditCost: number;
  idempotencyKey: string;
  refundReason: string;
  generate: AIProviderOptions;
};

export type MeteredAiCallResult =
  | { ok: true; result: AIProviderResult; transactionId?: string }
  | { ok: false; status: number; error: string };

/** Debit credits once, run generateWithFallback, refund on AI failure. */
export async function runMeteredAiCall(
  input: MeteredAiCallInput,
): Promise<MeteredAiCallResult> {
  let transactionId: string | undefined;

  if (input.creditCost > 0) {
    const debit = await deductCreditsAtomic({
      userId: input.userId,
      action: input.creditAction,
      cost: input.creditCost,
      idempotencyKey: input.idempotencyKey,
    });
    if (!debit.success) {
      return {
        ok: false,
        status: 402,
        error: debit.error ?? "Insufficient credits",
      };
    }
    transactionId = debit.transactionId;
  }

  try {
    const result = await generateWithFallback(input.generate);
    return { ok: true, result, transactionId };
  } catch (err) {
    if (transactionId && input.creditCost > 0) {
      await refundCredits({
        userId: input.userId,
        cost: input.creditCost,
        reason: input.refundReason,
        sourceTransactionId: transactionId,
      });
    }
    const message = err instanceof Error ? err.message : "AI generation failed";
    return { ok: false, status: 502, error: message };
  }
}

export { generateWithFallback };
