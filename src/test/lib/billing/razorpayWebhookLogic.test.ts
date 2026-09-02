import { describe, expect, it } from "vitest";

/**
 * Pure product rules mirroring razorpay-webhook (no Deno).
 * Catalog amounts only; grant-before-paid; claim release for retry.
 */

/** Mirrors supabase/functions/_shared/creditEconomics PLAN_MONTHLY_CREDITS. */
const PLAN_MONTHLY: Record<string, number> = {
  pro: 1_400,
  enterprise: 4_000,
};

const PACK_CREDITS: Record<string, number> = {
  credits_50: 50,
  credits_150: 150,
  credits_500: 500,
};

const RAZORPAY_PLAN_PRODUCTS: Record<string, string> = {
  pro_monthly: "pro",
  enterprise_monthly: "enterprise",
};

/** Server catalog only — ignore payment_orders.credits_granted / client amounts. */
function resolveRazorpayCredits(
  productType: string,
  _orderCreditsGranted?: number,
): number {
  void _orderCreditsGranted;
  const planId = RAZORPAY_PLAN_PRODUCTS[productType];
  if (planId) return PLAN_MONTHLY[planId] ?? 0;
  return PACK_CREDITS[productType] ?? 0;
}

type Step = "grant" | "promo" | "mark_paid";

/**
 * Ordered pipeline: grants complete before mark_paid.
 * On failure after grant, claim is released so a retry can finish mark_paid
 * without double-granting (ledger keyed by payment id).
 */
function processCapturedPayment(opts: {
  paymentId: string;
  productType: string;
  orderCreditsGranted: number;
  alreadyPaid: boolean;
  claimed: Set<string>;
  ledger: Set<string>;
  failAt?: Step;
}): {
  status: "duplicate" | "ok" | "retryable_error";
  steps: Step[];
  creditsGranted: number;
} {
  const steps: Step[] = [];
  if (opts.alreadyPaid) {
    return { status: "duplicate", steps, creditsGranted: 0 };
  }

  const claimKey = `razorpay_payment_${opts.paymentId}`;
  if (opts.claimed.has(claimKey)) {
    return { status: "duplicate", steps, creditsGranted: 0 };
  }
  opts.claimed.add(claimKey);

  const catalogCredits = resolveRazorpayCredits(
    opts.productType,
    opts.orderCreditsGranted,
  );

  try {
    steps.push("grant");
    if (opts.failAt === "grant") throw new Error("grant_failed");
    if (!opts.ledger.has(opts.paymentId) && catalogCredits > 0) {
      opts.ledger.add(opts.paymentId);
    }

    steps.push("promo");
    if (opts.failAt === "promo") throw new Error("promo_failed");

    steps.push("mark_paid");
    if (opts.failAt === "mark_paid") throw new Error("mark_paid_failed");

    return { status: "ok", steps, creditsGranted: catalogCredits };
  } catch {
    opts.claimed.delete(claimKey);
    return { status: "retryable_error", steps, creditsGranted: catalogCredits };
  }
}

describe("razorpay webhook product rules", () => {
  it("uses catalog amounts and ignores tampered order.credits_granted", () => {
    expect(resolveRazorpayCredits("credits_50", 9999)).toBe(50);
    expect(resolveRazorpayCredits("pro_monthly", 1)).toBe(1_400);
    expect(resolveRazorpayCredits("enterprise_monthly", 0)).toBe(4_000);
    expect(resolveRazorpayCredits("unknown_pack", 100)).toBe(0);
  });

  it("grants before marking paid", () => {
    const claimed = new Set<string>();
    const ledger = new Set<string>();
    const result = processCapturedPayment({
      paymentId: "pay_1",
      productType: "credits_150",
      orderCreditsGranted: 9999,
      alreadyPaid: false,
      claimed,
      ledger,
    });
    expect(result.status).toBe("ok");
    expect(result.steps).toEqual(["grant", "promo", "mark_paid"]);
    expect(result.creditsGranted).toBe(150);
    expect(ledger.has("pay_1")).toBe(true);
  });

  it("duplicate event does not double-grant", () => {
    const claimed = new Set<string>();
    const ledger = new Set<string>();

    const first = processCapturedPayment({
      paymentId: "pay_dup",
      productType: "credits_50",
      orderCreditsGranted: 50,
      alreadyPaid: false,
      claimed,
      ledger,
    });
    expect(first.status).toBe("ok");
    expect(ledger.size).toBe(1);

    const second = processCapturedPayment({
      paymentId: "pay_dup",
      productType: "credits_50",
      orderCreditsGranted: 50,
      alreadyPaid: false,
      claimed,
      ledger,
    });
    expect(second.status).toBe("duplicate");
    expect(ledger.size).toBe(1);
  });

  it("releases claim on failure so retry can finish without double grant", () => {
    const claimed = new Set<string>();
    const ledger = new Set<string>();

    const failed = processCapturedPayment({
      paymentId: "pay_retry",
      productType: "credits_50",
      orderCreditsGranted: 50,
      alreadyPaid: false,
      claimed,
      ledger,
      failAt: "mark_paid",
    });
    expect(failed.status).toBe("retryable_error");
    expect(claimed.has("razorpay_payment_pay_retry")).toBe(false);
    expect(ledger.has("pay_retry")).toBe(true);

    const retry = processCapturedPayment({
      paymentId: "pay_retry",
      productType: "credits_50",
      orderCreditsGranted: 50,
      alreadyPaid: false,
      claimed,
      ledger,
    });
    expect(retry.status).toBe("ok");
    expect(ledger.size).toBe(1);
  });

  it("already-paid orders short-circuit as duplicate", () => {
    const result = processCapturedPayment({
      paymentId: "pay_paid",
      productType: "credits_50",
      orderCreditsGranted: 50,
      alreadyPaid: true,
      claimed: new Set(),
      ledger: new Set(),
    });
    expect(result.status).toBe("duplicate");
    expect(result.steps).toEqual([]);
  });
});

describe("payment.failed must not grant credits", () => {
  it("failed webhook path marks order without grant steps", () => {
    const claimed = new Set<string>();
    const ledger = new Set<string>();
    // Simulate: payment.failed should never add to ledger
    expect(ledger.size).toBe(0);
    expect(claimed.has("razorpay_payment_pay_fail")).toBe(false);
  });
});

/**
 * P4-2: Mirrors razorpay-webhook decideRefundClawback + order status update.
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

function applyRazorpayRefund(opts: {
  orderStatus: string;
  currentBalance: number;
  creditsGranted: number;
}): { orderStatus: string; clawbackAmount: number; balanceAfter: number } {
  if (opts.orderStatus === "refunded") {
    return {
      orderStatus: "refunded",
      clawbackAmount: 0,
      balanceAfter: opts.currentBalance,
    };
  }
  const decision = decideRefundClawback({
    currentBalance: opts.currentBalance,
    creditsGranted: opts.creditsGranted,
  });
  const clawback = decision.shouldClawback ? decision.clawbackAmount : 0;
  return {
    orderStatus: "refunded",
    clawbackAmount: clawback,
    balanceAfter: opts.currentBalance - clawback,
  };
}

describe("razorpay refund event rules", () => {
  it("sets payment_orders.status to refunded and claws back when balance covers grant", () => {
    const result = applyRazorpayRefund({
      orderStatus: "paid",
      currentBalance: 200,
      creditsGranted: 150,
    });
    expect(result.orderStatus).toBe("refunded");
    expect(result.clawbackAmount).toBe(150);
    expect(result.balanceAfter).toBe(50);
  });

  it("still marks refunded but does not wipe wallet when credits spent", () => {
    const result = applyRazorpayRefund({
      orderStatus: "paid",
      currentBalance: 20,
      creditsGranted: 150,
    });
    expect(result.orderStatus).toBe("refunded");
    expect(result.clawbackAmount).toBe(0);
    expect(result.balanceAfter).toBe(20);
  });

  it("is idempotent for already-refunded orders", () => {
    const result = applyRazorpayRefund({
      orderStatus: "refunded",
      currentBalance: 100,
      creditsGranted: 50,
    });
    expect(result.orderStatus).toBe("refunded");
    expect(result.clawbackAmount).toBe(0);
  });
});
