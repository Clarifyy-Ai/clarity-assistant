import { describe, it, expect } from "vitest";
import {
  CREDIT_PACKS,
  getCreditPackById,
  getEnabledCreditPacks,
  formatInrPaise,
  razorpayPaiseForPlan,
} from "@/lib/billing/priceCalculator";

describe("CREDIT_PACKS configuration", () => {
  it("defines exactly three launch packs", () => {
    expect(CREDIT_PACKS).toHaveLength(3);
    expect(CREDIT_PACKS.map((p) => p.id)).toEqual(["pack_50", "pack_150", "pack_500"]);
  });

  it("has monotonically increasing credit amounts", () => {
    const credits = CREDIT_PACKS.map((p) => p.credits);
    expect(credits[0]).toBeLessThan(credits[1]);
    expect(credits[1]).toBeLessThan(credits[2]);
  });

  it("resolves pack by id", () => {
    const pack = getCreditPackById("pack_150");
    expect(pack?.credits).toBe(150);
    expect(pack?.label).toMatch(/150/);
  });

  it("enables all launch packs for Razorpay checkout", () => {
    const enabled = getEnabledCreditPacks();
    expect(enabled).toHaveLength(3);
    enabled.forEach((pack) => {
      expect(pack.credits).toBeGreaterThan(0);
    });
  });

  it("formats Razorpay INR catalog prices", () => {
    expect(formatInrPaise(249900)).toContain("2,499");
    expect(razorpayPaiseForPlan("pro")).toBe(249900);
    expect(razorpayPaiseForPlan("enterprise")).toBe(679900);
  });
});
