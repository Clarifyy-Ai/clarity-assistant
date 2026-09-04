import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  billingRefundRequestMailto,
  canRequestRefundSupport,
} from "@/lib/billing/billingRefundRequest";
import { SUPPORT_EMAIL } from "@/lib/constants/contact";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("billingRefundRequest", () => {
  it("allows support refund requests only for completed purchases", () => {
    expect(canRequestRefundSupport({ type: "purchase", status: "completed" })).toBe(true);
    expect(canRequestRefundSupport({ type: "purchase", status: "pending" })).toBe(false);
    expect(canRequestRefundSupport({ type: "refund", status: "completed" })).toBe(false);
    expect(canRequestRefundSupport({ type: "usage", status: "completed" })).toBe(false);
  });

  it("builds a support mailto rather than calling a payment refund API", () => {
    const href = billingRefundRequestMailto({
      description: "razorpay — credits 50",
      transactionId: "po_123",
    });
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    expect(href).toContain(encodeURIComponent("Refund request"));
    expect(href).toContain(encodeURIComponent("po_123"));
    expect(href).toContain(encodeURIComponent("Terms of Service"));
  });
});

describe("BillingHistory refund Action contract", () => {
  it("has no in-app money refund initiation — support mailto / invoice only", () => {
    const src = fs.readFileSync(
      path.join(root, "src/components/billing/BillingHistory.tsx"),
      "utf8",
    );
    expect(src).toContain("billingRefundRequestMailto");
    expect(src).toContain("canRequestRefundSupport");
    expect(src).toContain("Request refund");
    expect(src).toContain("billing-history-action-empty");
    expect(src).not.toMatch(/Issue refund/i);
    expect(src).not.toMatch(/razorpay.*refund|createRefund|refundPayment/i);
    expect(src).not.toMatch(/fetchEdgeJson\([^)]*refund/i);
  });
});
