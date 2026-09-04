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
        message: "Payments are not configured",
        status: 503,
        code: "PAYMENTS_NOT_CONFIGURED",
      }),
    );
    expect(msg).toMatch(/not configured/i);
    expect(msg).not.toMatch(/something went wrong/i);
  });

  it("flags PAYMENTS_NOT_CONFIGURED for the billing page banner", async () => {
    const { isPaymentsNotConfiguredError } = await import(
      "@/lib/billing/razorpayCheckout"
    );
    expect(
      isPaymentsNotConfiguredError(
        new ApiClientError({
          message: "Payments are not configured",
          status: 503,
          code: "PAYMENTS_NOT_CONFIGURED",
        }),
      ),
    ).toBe(true);
    expect(
      isPaymentsNotConfiguredError(
        new ApiClientError({
          message: "Checkout is not available for this product right now.",
          status: 503,
          code: "PRICE_UNAVAILABLE",
        }),
      ),
    ).toBe(false);
  });

  it("maps placeholder integration copy and 400 catalog validation", () => {
    expect(
      toPaymentUserFacingError(
        new ApiClientError({
          message: "Integration not configured",
          status: 503,
          code: "API_ERROR",
        }),
      ),
    ).toMatch(/not configured/i);

    expect(
      toPaymentUserFacingError(
        new ApiClientError({
          message: "Invalid product_type. Use a supported plan or credit pack.",
          status: 400,
          code: "VALIDATION_ERROR",
        }),
      ),
    ).toMatch(/not available for checkout/i);
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

  it("assertRazorpayProductType accepts only edge PRODUCT_TYPES", async () => {
    const {
      assertRazorpayProductType,
      isRazorpayProductType,
      RAZORPAY_PRODUCT_TYPES,
    } = await import("@/lib/billing/razorpayCheckout");
    expect([...RAZORPAY_PRODUCT_TYPES]).toEqual([
      "pro_monthly",
      "enterprise_monthly",
      "credits_50",
      "credits_150",
      "credits_500",
    ]);
    expect(isRazorpayProductType("pro_monthly")).toBe(true);
    expect(isRazorpayProductType("starter_monthly")).toBe(false);
    expect(() => assertRazorpayProductType("pro")).toThrow(/not available for checkout/i);
    expect(assertRazorpayProductType("credits_50")).toBe("credits_50");
  });

  it("UpgradeModal surfaces payments-not-configured banner and hydrate", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    const modal = fs.readFileSync(
      path.join(root, "src/components/billing/UpgradeModal.tsx"),
      "utf8",
    );
    expect(modal).toContain('data-testid="payments-not-configured-banner"');
    expect(modal).toContain("getCatalogPaymentsConfigured");
    expect(modal).toContain("isPaymentsNotConfiguredError");
    expect(modal).not.toMatch(/\bstartTime\b/);
  });
});
