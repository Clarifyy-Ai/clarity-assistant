import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("razorpay create-order fail-closed contract", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/razorpay-create-order/index.ts"),
    "utf8",
  );

  it("does not return a provider order when internal persist fails", () => {
    expect(src).toContain("ORDER_PERSIST_FAILED");
    expect(src).toContain("status: \"pending\"");
    expect(src).not.toMatch(/payment_order_id:\s*row\?\.id\s*\?\?\s*null/);
    expect(src).not.toMatch(/console\.error\("\[razorpay-create-order\] insert"/);
  });

  it("records reconciliation when provider succeeds and durable update fails", () => {
    expect(src).toContain("reconciliation_required");
    expect(src).toContain("billing_reconciliation_incidents");
  });

  it("supports idempotent cancel when the user dismisses checkout", () => {
    expect(src).toContain('action: z.literal("cancel")');
    expect(src).toContain('transitionOrder(cancelParsed.data.payment_order_id, "cancelled")');
    expect(src).toContain("assertPaymentStatusTransition");
  });

  it("supports fail when Razorpay declines payment", () => {
    expect(src).toContain('action: z.literal("fail")');
    expect(src).toContain('transitionOrder(failParsed.data.payment_order_id, "failed")');
  });

  it("returns PAYMENTS_NOT_CONFIGURED for missing provider secrets without a generic 500", () => {
    expect(src).toContain("PAYMENTS_NOT_CONFIGURED");
    expect(src).toContain("paymentsNotConfiguredBody");
    expect(src).toContain("checkoutConfigured");
    expect(src).not.toContain("Integration not configured");
  });

  it("allows cancel and fail without requiring Razorpay keys", () => {
    const cancelIdx = src.indexOf('action: z.literal("cancel")');
    const configIdx = src.indexOf("checkoutConfigured");
    expect(cancelIdx).toBeGreaterThan(0);
    expect(configIdx).toBeGreaterThan(cancelIdx);
  });
});

describe("razorpay webhook payment failure contract", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/razorpay-webhook/index.ts"),
    "utf8",
  );

  it("handles payment.failed without calling fulfill in the handler", () => {
    expect(src).toContain('eventName === "payment.failed"');
    expect(src).toContain("handlePaymentFailedEvent");
    expect(src).toContain("markFailedRazorpayOrder");
  });

  it("refuses events when the webhook secret is missing with PAYMENTS_NOT_CONFIGURED", () => {
    expect(src).toContain("paymentsNotConfiguredBody");
    expect(src).toContain("webhookConfigured");
    expect(src).not.toContain("Webhook secret not configured");
  });

  it("dedupes webhooks without event id using payment fallback key", () => {
    expect(src).toContain("razorpay_webhook_payment_");
    expect(src).toContain("claimWebhookEvent");
  });
});

describe("razorpay verify-payment config contract", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/razorpay-verify-payment/index.ts"),
    "utf8",
  );

  it("uses shared Razorpay provider config and PAYMENTS_NOT_CONFIGURED", () => {
    expect(src).toContain("getRazorpayProviderConfig");
    expect(src).toContain("paymentsNotConfiguredBody");
    expect(src).toContain("fulfillCapturedRazorpayOrder");
    expect(src).not.toContain("Razorpay not configured");
  });
});

describe("billing config production parity", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/_shared/billingConfig.ts"),
    "utf8",
  );

  it("requires Razorpay webhook secret in production by default", () => {
    expect(src).toContain("requireRazorpay && environment === \"production\"");
    expect(src).toContain("RAZORPAY_WEBHOOK_SECRET");
  });

  it("requires PUBLIC_URL when Razorpay or Stripe is required in production", () => {
    expect(src).toContain("requireStripe || requireRazorpay");
  });
});

describe("razorpay checkout client failure wiring", () => {
  const src = fs.readFileSync(
    path.join(root, "src/lib/billing/razorpayCheckout.ts"),
    "utf8",
  );

  it("marks orders cancelled on dismiss and failed on payment.failed", () => {
    expect(src).toContain("cancelRazorpayOrder");
    expect(src).toContain("failRazorpayOrder");
    expect(src).toContain('action: "cancel"');
    expect(src).toContain('action: "fail"');
    expect(src).toContain("payment.failed");
  });
});

describe("create-exam-paper AI-fill capability", () => {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/create-exam-paper/index.ts"),
    "utf8",
  );

  it("resolves the capability-aware plan before credit reservation", () => {
    // The AI-fill gate lives in decideGenerationPlan, which is fed hasCapability.
    expect(src).toMatch(/decideGenerationPlan\s*\(/);
    expect(src).toMatch(/hasCapability\s*\(/);
    expect(src).toContain("gov_exam_ai_fill");

    const planIdx = src.lastIndexOf("decideGenerationPlan(");
    const preflightIdx = src.indexOf("preflightSpendableCredits(");
    const reserveIdx = src.indexOf("createReservedPaperJob(");
    expect(planIdx).toBeGreaterThan(0);
    expect(preflightIdx).toBeGreaterThan(planIdx);
    expect(reserveIdx).toBeGreaterThan(preflightIdx);
  });

  it("refuses a blocked plan before spending credits", () => {
    const blockedIdx = src.indexOf('plan.kind === "blocked"');
    const preflightIdx = src.indexOf("preflightSpendableCredits(");
    expect(blockedIdx).toBeGreaterThan(0);
    expect(preflightIdx).toBeGreaterThan(blockedIdx);
    expect(src).toContain("blockedPlanPayload");
  });

  it("atomically enqueues job + reserves credits via createReservedPaperJob", () => {
    expect(src).toContain("createReservedPaperJob(");
    const claimSrc = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/claimJobCredits.ts"),
      "utf8",
    );
    expect(claimSrc).toContain("enqueue_gov_paper_job");
    const preflightIdx = src.indexOf("preflightSpendableCredits(");
    const reserveIdx = src.indexOf("createReservedPaperJob(");
    expect(preflightIdx).toBeGreaterThan(0);
    expect(reserveIdx).toBeGreaterThan(preflightIdx);
  });

  it("keeps official previous papers outside the AI-fill gate", () => {
    const planSrc = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/govGenerationPlan.ts"),
      "utf8",
    );
    // official_previous is deliberately absent from the AI-eligible set, so a
    // reproduction of a real paper can never be padded with generated questions.
    const eligible = planSrc.match(/AI_ELIGIBLE_MODES = new Set\(\[([^\]]*)\]\)/);
    expect(eligible).not.toBeNull();
    expect(eligible![1]).toContain("generated_mock");
    expect(eligible![1]).not.toContain("official_previous");
  });
});
