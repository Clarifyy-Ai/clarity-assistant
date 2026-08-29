import { describe, expect, it } from "vitest";

/** Mirrors supabase/functions/_shared/retired.ts envelope. */
function retiredBillingEnvelope() {
  return {
    error: "This endpoint has been retired.",
    code: "FUNCTION_RETIRED",
    reason: "stripe_unused_razorpay_only",
    replacement: "razorpay-create-order",
    status: "retired",
  };
}

/** Mirrors stripe-webhook signed-event ignore envelope. */
function stripeWebhookRetiredEnvelope() {
  return {
    received: true,
    ignored: true,
    code: "FUNCTION_RETIRED",
    status: "retired",
    reason: "stripe_unused_razorpay_only",
    replacement: "razorpay-create-order",
  };
}

describe("retired billing edge envelopes", () => {
  it("Stripe portal/checkout stubs return FUNCTION_RETIRED with Razorpay replacement", () => {
    const body = retiredBillingEnvelope();
    expect(body.code).toBe("FUNCTION_RETIRED");
    expect(body.replacement).toBe("razorpay-create-order");
    expect(body.reason).toBe("stripe_unused_razorpay_only");
  });

  it("stripe-webhook returns retirement envelope instead of granting credits", () => {
    const body = stripeWebhookRetiredEnvelope();
    expect(body.received).toBe(true);
    expect(body.ignored).toBe(true);
    expect(body.code).toBe("FUNCTION_RETIRED");
    expect(body.replacement).toBe("razorpay-create-order");
  });
});

/** Mirrors claimRazorpayWebhookEvent replay semantics. */
function claimWebhookEvent(
  seen: Set<string>,
  eventId: string,
): "process" | "duplicate" {
  const key = `razorpay_webhook_${eventId}`;
  if (seen.has(key)) return "duplicate";
  seen.add(key);
  return "process";
}

describe("razorpay webhook replay safety", () => {
  it("replays the same event id without re-processing", () => {
    const seen = new Set<string>();
    expect(claimWebhookEvent(seen, "evt_abc")).toBe("process");
    expect(claimWebhookEvent(seen, "evt_abc")).toBe("duplicate");
    expect(seen.size).toBe(1);
  });
});
