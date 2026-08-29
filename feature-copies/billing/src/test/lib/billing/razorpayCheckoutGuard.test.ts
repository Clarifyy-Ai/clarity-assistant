import { describe, expect, it } from "vitest";
import { assertInternalOrderId } from "@/lib/billing/razorpayCheckout";

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
