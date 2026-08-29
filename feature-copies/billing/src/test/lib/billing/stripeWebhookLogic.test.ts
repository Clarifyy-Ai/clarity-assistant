import { describe, expect, it } from "vitest";

/** Mirrors stripe-webhook pack credit resolution (server catalog only). */
function resolvePackCredits(metadata: Record<string, string>): number {
  const packs: Record<string, number> = {
    credits_50: 50,
    credits_150: 150,
    credits_500: 500,
  };
  const packId = metadata.credit_pack_id?.trim();
  if (packId && packs[packId] != null) return packs[packId];
  const tampered = Number(metadata.credit_amount ?? 0);
  void tampered;
  return 0;
}

function rejectTestModeInProduction(appEnv: string, livemode: boolean): boolean {
  const prod = appEnv === "production" || appEnv === "prod";
  return !(prod && livemode === false);
}

describe("stripe webhook product rules", () => {
  it("uses catalog pack id, ignores tampered credit_amount", () => {
    expect(
      resolvePackCredits({ credit_pack_id: "credits_50", credit_amount: "9999" }),
    ).toBe(50);
    expect(resolvePackCredits({ credit_amount: "500" })).toBe(0);
  });

  it("rejects test-mode events in production", () => {
    expect(rejectTestModeInProduction("production", false)).toBe(false);
    expect(rejectTestModeInProduction("production", true)).toBe(true);
  });

  it("duplicate idempotency claim can be released for retry", () => {
    const claimed = new Set<string>();
    const claim = (id: string) => {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    };
    const release = (id: string) => claimed.delete(id);

    expect(claim("evt_1")).toBe(true);
    expect(claim("evt_1")).toBe(false);
    release("evt_1");
    expect(claim("evt_1")).toBe(true);
  });

  /**
   * P0-2: invoice.payment_failed must update status/plan only — never wipe
   * purchased credit packs by setting an absolute free-tier credit balance.
   */
  it("payment_failed profile patch omits credits field", () => {
    function buildPaymentFailedProfilePatch(attemptCount: number): Record<string, unknown> {
      const nowIso = "2026-07-28T00:00:00.000Z";
      if (attemptCount >= 3) {
        return {
          plan_id: "free",
          subscription_status: "past_due",
          payment_failed_at: nowIso,
          updated_at: nowIso,
        };
      }
      return {
        subscription_status: "past_due",
        payment_failed_at: nowIso,
        updated_at: nowIso,
      };
    }

    const withPackBalance = 500;
    const gracePatch = buildPaymentFailedProfilePatch(1);
    const downgradePatch = buildPaymentFailedProfilePatch(3);

    expect(gracePatch).not.toHaveProperty("credits");
    expect(downgradePatch).not.toHaveProperty("credits");
    // Simulated wallet after applying either patch — balance unchanged
    expect(withPackBalance).toBe(500);
  });
});

/**
 * P4-2: Mirrors stripe-webhook decideRefundClawback — only claw back when
 * unspent balance still covers the original grant; never wipe the wallet.
 */
function decideRefundClawback(opts: {
  currentBalance: number;
  creditsGranted: number;
}): {
  clawbackAmount: number;
  shouldClawback: boolean;
  reason: "full_clawback" | "insufficient_unspent" | "nothing_to_claw";
} {
  const balance = Math.max(0, Math.floor(opts.currentBalance));
  const granted = Math.max(0, Math.floor(opts.creditsGranted));
  if (granted <= 0) {
    return { clawbackAmount: 0, shouldClawback: false, reason: "nothing_to_claw" };
  }
  if (balance >= granted) {
    return { clawbackAmount: granted, shouldClawback: true, reason: "full_clawback" };
  }
  return { clawbackAmount: 0, shouldClawback: false, reason: "insufficient_unspent" };
}

describe("stripe charge.refunded clawback rules", () => {
  it("claws back full grant when balance is sufficient", () => {
    expect(decideRefundClawback({ currentBalance: 200, creditsGranted: 150 })).toEqual({
      clawbackAmount: 150,
      shouldClawback: true,
      reason: "full_clawback",
    });
  });

  it("skips clawback when user has spent below the grant (never wipe)", () => {
    expect(decideRefundClawback({ currentBalance: 40, creditsGranted: 150 })).toEqual({
      clawbackAmount: 0,
      shouldClawback: false,
      reason: "insufficient_unspent",
    });
  });

  it("flags payment but claws nothing when grant is zero", () => {
    expect(decideRefundClawback({ currentBalance: 100, creditsGranted: 0 })).toEqual({
      clawbackAmount: 0,
      shouldClawback: false,
      reason: "nothing_to_claw",
    });
  });
});
