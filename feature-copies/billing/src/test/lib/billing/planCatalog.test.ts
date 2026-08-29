import { describe, expect, it } from "vitest";
import {
  EXPECTED_BACKEND_RANKS,
  getCatalogDisplayName,
  monthlyCreditsForPlan,
  normalizeCanonicalPlanId,
  planRank,
  PLAN_RANK,
} from "@/lib/billing/planCatalog";
import { getPlanDisplayName, PLAN_DISPLAY_NAMES } from "@/lib/constants/pricing";
import { normalizePlanId } from "@/lib/billing/planIds";
import { PLANS } from "@/lib/billing/subscriptionManager";

describe("plan catalog parity", () => {
  it("ranks match expected backend ranks", () => {
    expect(PLAN_RANK).toEqual(EXPECTED_BACKEND_RANKS);
    expect(PLAN_RANK.starter).toBeGreaterThan(PLAN_RANK.free);
    expect(PLAN_RANK.elite).toBe(PLAN_RANK.pro);
    expect(PLAN_RANK.enterprise).toBeGreaterThan(PLAN_RANK.pro);
  });

  it("normalizes aliases deterministically", () => {
    expect(normalizeCanonicalPlanId("team")).toBe("enterprise");
    expect(normalizeCanonicalPlanId("max")).toBe("enterprise");
    expect(normalizeCanonicalPlanId("elite")).toBe("elite");
    expect(normalizeCanonicalPlanId("starter")).toBe("starter");
    expect(normalizeCanonicalPlanId("unknown-xyz")).toBeNull();
  });

  it("rejects unknown plans for rank checks", () => {
    expect(planRank("not-a-plan")).toBe(-1);
  });

  it("displays Max for enterprise (consumer tier)", () => {
    expect(getCatalogDisplayName("enterprise")).toBe("Max");
    expect(getCatalogDisplayName("team")).toBe("Max");
    expect(PLAN_DISPLAY_NAMES.enterprise).toBe("Max");
    expect(getPlanDisplayName("enterprise")).toBe("Max");
  });

  it("launch normalizePlanId maps elite→pro and starter→free", () => {
    expect(normalizePlanId("elite")).toBe("pro");
    expect(normalizePlanId("starter")).toBe("free");
    expect(normalizePlanId("team")).toBe("enterprise");
  });

  it("never reports unlimited credits", () => {
    for (const id of ["free", "pro", "enterprise", "elite", "starter"] as const) {
      expect(monthlyCreditsForPlan(id)).toBeGreaterThan(0);
    }
  });

  it("enterprise and pro plans keep catalog price ID fields", () => {
    expect(Object.keys(PLANS.enterprise)).toEqual(
      expect.arrayContaining(["stripePriceIdMonthly", "stripePriceIdYearly"]),
    );
    expect(Object.keys(PLANS.pro)).toEqual(
      expect.arrayContaining(["stripePriceIdMonthly", "stripePriceIdYearly"]),
    );
  });
});
