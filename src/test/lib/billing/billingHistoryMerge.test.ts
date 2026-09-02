import { describe, expect, it } from "vitest";
import { mergeBillingHistoryTransactions } from "@/lib/billing/billingHistoryMerge";

describe("mergeBillingHistoryTransactions", () => {
  it("shows fulfilled payment_orders once and hides duplicate purchase ledger rows", () => {
    const merged = mergeBillingHistoryTransactions(
      [
        {
          id: "ct-1",
          amount: 150,
          action: "purchase:credits_150",
          created_at: "2026-01-02T10:00:00Z",
          stripe_payment_id: "pay_abc",
        },
        {
          id: "ct-2",
          amount: -5,
          action: "usage:prep_tool",
          created_at: "2026-01-01T10:00:00Z",
          stripe_payment_id: null,
        },
      ],
      [
        {
          id: "po-1",
          product_type: "credits_150",
          amount_paise: 189_900,
          status: "fulfilled",
          created_at: "2026-01-02T09:55:00Z",
          paid_at: "2026-01-02T10:00:00Z",
          provider: "razorpay",
          credits_granted: 150,
          provider_payment_id: "pay_abc",
        },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged.filter((t) => t.type === "purchase")).toHaveLength(1);
    expect(merged.find((t) => t.id === "order:po-1")?.status).toBe("completed");
    expect(merged.find((t) => t.id === "ledger:ct-2")?.type).toBe("usage");
  });

  it("maps pending and failed payment orders to correct status buckets", () => {
    const merged = mergeBillingHistoryTransactions(
      [],
      [
        {
          id: "po-pending",
          product_type: "credits_50",
          amount_paise: 69_900,
          status: "provider_created",
          created_at: "2026-01-03T10:00:00Z",
          paid_at: null,
          provider: "razorpay",
          credits_granted: 50,
          provider_payment_id: null,
        },
        {
          id: "po-failed",
          product_type: "credits_50",
          amount_paise: 69_900,
          status: "failed",
          created_at: "2026-01-03T11:00:00Z",
          paid_at: null,
          provider: "razorpay",
          credits_granted: 50,
          provider_payment_id: null,
        },
      ],
    );

    expect(merged.find((t) => t.id === "order:po-pending")?.status).toBe("pending");
    expect(merged.find((t) => t.id === "order:po-failed")?.status).toBe("failed");
    expect(merged.every((t) => t.credits === 0 || t.status === "completed")).toBe(true);
  });

  it("surfaces refunded payment orders and refund ledger rows", () => {
    const merged = mergeBillingHistoryTransactions(
      [
        {
          id: "ct-refund",
          amount: -50,
          action: "refund",
          created_at: "2026-01-05T12:00:00Z",
          stripe_payment_id: "razorpay_refund_order_po-1",
        },
      ],
      [
        {
          id: "po-1",
          product_type: "credits_50",
          amount_paise: 69_900,
          status: "refunded",
          created_at: "2026-01-04T09:00:00Z",
          paid_at: "2026-01-04T09:05:00Z",
          provider: "razorpay",
          credits_granted: 50,
          provider_payment_id: "pay_abc",
        },
      ],
    );

    const refunds = merged.filter((t) => t.type === "refund");
    expect(refunds.length).toBeGreaterThanOrEqual(2);
    expect(merged.find((t) => t.id === "order:po-1")?.status).toBe("refunded");
    expect(merged.find((t) => t.id === "order:po-1")?.description).toMatch(/Refund/i);
    expect(merged.find((t) => t.id === "ledger:ct-refund")?.credits).toBe(-50);
  });

  it("keeps bonus ledger rows even when payment id is present", () => {
    const merged = mergeBillingHistoryTransactions(
      [
        {
          id: "ct-bonus",
          amount: 10,
          action: "bonus:promo",
          created_at: "2026-01-04T10:00:00Z",
          stripe_payment_id: "pay_abc_promo",
        },
      ],
      [
        {
          id: "po-1",
          product_type: "credits_50",
          amount_paise: 69_900,
          status: "fulfilled",
          created_at: "2026-01-04T09:00:00Z",
          paid_at: "2026-01-04T09:05:00Z",
          provider: "razorpay",
          credits_granted: 50,
          provider_payment_id: "pay_abc",
        },
      ],
    );

    expect(merged.some((t) => t.id === "ledger:ct-bonus" && t.type === "bonus")).toBe(true);
  });
});
