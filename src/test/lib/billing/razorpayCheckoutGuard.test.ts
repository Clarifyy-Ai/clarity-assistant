import { describe, expect, it } from "vitest";
import { assertInternalOrderId } from "@/lib/billing/razorpayCheckout";
import {
  isRazorpaySandboxKey,
  parseRazorpayPaymentFailure,
  showRazorpayQaSandboxHint,
  toPaymentUserFacingError,
} from "@/lib/billing/razorpayCheckout";
import { ApiClientError } from "@/lib/api/apiClient";

const PREPARE_ERROR = "Checkout could not be prepared. Please try again.";

describe("assertInternalOrderId", () => {
  it("returns a non-empty trimmed payment_order_id", () => {
    expect(assertInternalOrderId("po_abc123")).toBe("po_abc123");
    expect(assertInternalOrderId("  po_abc123  ")).toBe("po_abc123");
  });

  it("throws a user-safe error when the id is missing", () => {
    expect(() => assertInternalOrderId(null)).toThrow(PREPARE_ERROR);
    expect(() => assertInternalOrderId(undefined)).toThrow(PREPARE_ERROR);
    expect(() => assertInternalOrderId("")).toThrow(PREPARE_ERROR);
    expect(() => assertInternalOrderId("   ")).toThrow(PREPARE_ERROR);
  });
});

describe("razorpay checkout guards", () => {
  it("detects Razorpay sandbox keys", () => {
    expect(isRazorpaySandboxKey("rzp_test_abc")).toBe(true);
    expect(isRazorpaySandboxKey("rzp_live_abc")).toBe(false);
    expect(showRazorpayQaSandboxHint("rzp_test_abc")).toBe(true);
  });

  it("maps auth failures to session messaging (not generic outage)", () => {
    const msg = toPaymentUserFacingError(
      new ApiClientError({
        message: "Invalid or expired token",
        status: 401,
        code: "AUTH_INVALID",
      }),
    );
    expect(msg).toMatch(/sign in again/i);
    expect(msg).not.toMatch(/temporarily unavailable/i);
  });

  it("maps international card declines to India sandbox guidance", () => {
    const msg = toPaymentUserFacingError(
      new Error("Payment failed: international_transaction_not_allowed"),
    );
    expect(msg).toMatch(/india|international|declined/i);
  });

  it("maps Razorpay validate/account failures to actionable copy", () => {
    const parsed = parseRazorpayPaymentFailure({
      error: {
        reason: "SERVER_ERROR",
        description: "payments/validate/account failed",
      },
    });
    expect(parsed).toMatch(/validate|refresh|sandbox/i);

    const msg = toPaymentUserFacingError(new Error("Uh oh! Something went wrong"));
    expect(msg).toMatch(/razorpay|refresh|sandbox/i);
  });

  it("maps 503 billing misconfig without generic Something went wrong", () => {
    const msg = toPaymentUserFacingError(
      new ApiClientError({
        message: "Integration not configured",
        status: 503,
        code: "API_ERROR",
      }),
    );
    expect(msg).toMatch(/not configured/i);
  });

  it("create-order source wires failRazorpayOrder on payment.failed", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    const src = fs.readFileSync(
      path.join(root, "src/lib/billing/razorpayCheckout.ts"),
      "utf8",
    );
    expect(src).toContain("failRazorpayOrder");
    expect(src).toContain('action: "fail"');
    expect(src).toContain("payment.failed");
  });
});
