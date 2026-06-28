import { describe, it, expect } from "vitest";
import {
  CREDIT_PACKS,
  getCreditPackById,
  getEnabledCreditPacks,
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

  it("filters enabled packs by stripe price id env", () => {
    const enabled = getEnabledCreditPacks();
    enabled.forEach((pack) => {
      expect(pack.stripePriceId?.trim().length).toBeGreaterThan(0);
    });
  });
});
