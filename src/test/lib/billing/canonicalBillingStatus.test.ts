import { describe, expect, it } from "vitest";
import {
  isPastDueBeyondGrace,
  resolveCanonicalBillingStatus,
} from "@/lib/billing/canonicalBillingStatus";
import { isBillingSuspended } from "@/lib/billing/subscriptionAccess";

describe("canonical billing status", () => {
  it("past_due beats active so Billing and ProtectedRoute agree", () => {
    expect(resolveCanonicalBillingStatus("past_due", "active")).toBe("past_due");
    expect(resolveCanonicalBillingStatus("active", "past_due")).toBe("past_due");
    expect(resolveCanonicalBillingStatus("active", "active")).toBe("active");
  });

  it("within-grace past_due is not suspended; beyond-grace is", () => {
    const within = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const beyond = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
    expect(isPastDueBeyondGrace({ status: "past_due", paymentFailedAt: within })).toBe(false);
    expect(isPastDueBeyondGrace({ status: "past_due", paymentFailedAt: beyond })).toBe(true);
    expect(
      isBillingSuspended({
        subscription_status: "past_due",
        payment_failed_at: within,
      } as never),
    ).toBe(false);
    expect(
      isBillingSuspended({
        subscription_status: "past_due",
        payment_failed_at: beyond,
      } as never),
    ).toBe(true);
  });
});
