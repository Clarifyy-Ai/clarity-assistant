import { describe, expect, it } from "vitest";
import {
  canTransitionPaymentStatus,
  mapPaymentOrderDisplayStatus,
  REUSABLE_CHECKOUT_STATUSES,
} from "@/lib/billing/paymentStateMachine";

describe("payment order state machine", () => {
  it("moves pending → provider_created → fulfilled", () => {
    expect(canTransitionPaymentStatus("pending", "provider_created")).toBe(true);
    expect(canTransitionPaymentStatus("provider_created", "fulfilled")).toBe(true);
    expect(canTransitionPaymentStatus("pending", "fulfilled")).toBe(false);
  });

  it("allows cancel from open checkout states only", () => {
    expect(canTransitionPaymentStatus("provider_created", "cancelled")).toBe(true);
    expect(canTransitionPaymentStatus("fulfilled", "cancelled")).toBe(false);
  });

  it("allows fail from open checkout states only", () => {
    expect(canTransitionPaymentStatus("provider_created", "failed")).toBe(true);
    expect(canTransitionPaymentStatus("fulfilled", "failed")).toBe(false);
  });

  it("reuses open checkout orders for idempotent create-order", () => {
    expect(REUSABLE_CHECKOUT_STATUSES).toContain("provider_created");
    expect(REUSABLE_CHECKOUT_STATUSES).not.toContain("fulfilled");
  });

  it("maps ledger statuses to billing history buckets", () => {
    expect(mapPaymentOrderDisplayStatus("fulfilled")).toBe("completed");
    expect(mapPaymentOrderDisplayStatus("provider_created")).toBe("pending");
    expect(mapPaymentOrderDisplayStatus("cancelled")).toBe("failed");
    expect(mapPaymentOrderDisplayStatus("refunded")).toBe("refunded");
    expect(mapPaymentOrderDisplayStatus("reconciliation_required")).toBe("failed");
  });
});
