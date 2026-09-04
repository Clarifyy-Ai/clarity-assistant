import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * Contract: razorpay-webhook verifies HMAC signature before grant, and
 * fulfillCapturedRazorpayOrder is exactly-once via payment idempotency claim.
 */
describe("razorpay webhook signature + exactly-once grant (Edge source)", () => {
  const webhook = read("supabase/functions/razorpay-webhook/index.ts");
  const fulfill = read("supabase/functions/_shared/razorpayFulfill.ts");
  const createOrder = read("supabase/functions/razorpay-create-order/index.ts");

  it("refuses events without webhook secret (fail closed)", () => {
    expect(webhook).toContain("webhookConfigured");
    expect(webhook).toContain("paymentsNotConfiguredBody");
    expect(webhook).toMatch(/status:\s*503/);
  });

  it("verifies x-razorpay-signature with HMAC before fulfill", () => {
    expect(webhook).toContain("x-razorpay-signature");
    expect(webhook).toContain("verifySignature");
    expect(webhook).toContain("hmacSha256Hex");
    expect(webhook).toContain("timingSafeEqual");
    expect(webhook).toContain("Invalid signature");
    expect(webhook).toMatch(/status:\s*401/);

    // Handler order: signature check then fulfill call (use lastIndex for call site)
    const sigCallIdx = webhook.lastIndexOf("await verifySignature");
    const fulfillCallIdx = webhook.lastIndexOf("await fulfillCapturedRazorpayOrder");
    expect(sigCallIdx).toBeGreaterThan(0);
    expect(fulfillCallIdx).toBeGreaterThan(sigCallIdx);
  });

  it("claims webhook event id (or payment fallback) before grant", () => {
    expect(webhook).toContain("claimWebhookEvent");
    expect(webhook).toContain("claimRazorpayWebhookEvent");
    expect(webhook).toContain("razorpay_webhook_payment_");
    expect(webhook).toContain("duplicate: true");
  });

  it("exactly-once grant path: claim payment id before add_credits / mark paid", () => {
    expect(fulfill).toContain("claimPaymentIdempotency");
    expect(fulfill).toContain("razorpay_payment_");
    expect(fulfill).toContain("grantCreditsOnce");
    expect(fulfill).toContain("fulfillCapturedRazorpayOrder");
    // Inside fulfillCapturedRazorpayOrder: claim → grant → mark fulfilled
    const fnStart = fulfill.indexOf("export async function fulfillCapturedRazorpayOrder");
    const body = fulfill.slice(fnStart);
    const claimIdx = body.indexOf("claimPaymentIdempotency");
    const grantIdx = body.indexOf("grantCreditsOnce");
    const markFulfilledIdx = body.indexOf('status: "fulfilled"');
    expect(claimIdx).toBeGreaterThan(0);
    expect(grantIdx).toBeGreaterThan(claimIdx);
    expect(markFulfilledIdx).toBeGreaterThan(grantIdx);
  });

  it("create-order fails closed without Razorpay secrets", () => {
    expect(createOrder).toContain("checkoutConfigured");
    expect(createOrder).toContain("PAYMENTS_NOT_CONFIGURED");
    expect(createOrder).toContain("paymentsNotConfiguredBody");
    expect(createOrder).toMatch(/status:\s*503|,\s*503\)/);
  });

  it("docs/QA copy must not instruct Stripe 4242 for Razorpay test checkout", () => {
    const qaEnv = read("docs/QA_ENVIRONMENTS.md");
    const qaManual = read("docs/QA_MANUAL.md");
    const qaReport = read("docs/QA_REPORT.md");
    expect(qaEnv).toMatch(/Razorpay/i);
    expect(qaEnv).not.toMatch(/^## Stripe test card/m);
    expect(qaManual).toMatch(/Razorpay/i);
    expect(qaManual).not.toMatch(/In Stripe Checkout, use test card `4242/);
    expect(qaReport).toMatch(/Razorpay Checkout opens/i);
    expect(qaReport).not.toMatch(/Stripe Checkout opens, test card `4242/);
  });
});
