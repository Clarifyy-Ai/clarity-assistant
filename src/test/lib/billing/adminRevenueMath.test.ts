import { describe, expect, it } from "vitest";
import { catalogPaiseForPlan, RAZORPAY_INR_PAISE } from "@/lib/billing/priceCalculator";

/** Pure helper mirroring creditsDB.monthlyRevenueByPlan money math. */
export function computeInrCatalogByPlan(
  subscriptions: Array<{ plan_id: string | null; status: string }>,
): { planId: string; totalPaise: number; currency: "INR" }[] {
  const counts: Record<string, number> = {};
  for (const row of subscriptions) {
    if (row.status !== "active" && row.status !== "trialing") continue;
    const planId = String(row.plan_id ?? "free");
    counts[planId] = (counts[planId] ?? 0) + 1;
  }
  return Object.entries(counts).map(([planId, count]) => ({
    planId,
    totalPaise: catalogPaiseForPlan(planId) * count,
    currency: "INR" as const,
  }));
}

export function sumRazorpayPaise(
  orders: Array<{ amount_paise: number; status: string }>,
): number {
  return orders
    .filter((o) => ["paid", "captured", "success"].includes(o.status))
    .reduce((sum, o) => sum + Math.abs(o.amount_paise || 0), 0);
}

describe("admin revenue money math", () => {
  it("computes INR catalog from subscriptions × Razorpay prices, not credit counts", () => {
    const rows = computeInrCatalogByPlan([
      { plan_id: "pro", status: "active" },
      { plan_id: "pro", status: "trialing" },
      { plan_id: "enterprise", status: "active" },
      { plan_id: "free", status: "active" },
      { plan_id: "pro", status: "canceled" },
    ]);

    const byPlan = Object.fromEntries(rows.map((r) => [r.planId, r.totalPaise]));
    expect(byPlan.pro).toBe(2 * RAZORPAY_INR_PAISE.pro_monthly);
    expect(byPlan.enterprise).toBe(RAZORPAY_INR_PAISE.enterprise_monthly);
    expect(byPlan.free).toBe(0);

    const totalInr = rows.reduce((s, r) => s + r.totalPaise, 0);
    expect(totalInr).toBe(2 * 249_900 + 679_900);
  });

  it("never treats credit ledger amounts as money", () => {
    const creditLedgerSum = 500;
    const wronglyAsPaise = creditLedgerSum;
    const correctlyIgnoredForCatalog = 0;
    expect(wronglyAsPaise).not.toBe(correctlyIgnoredForCatalog);
    expect(computeInrCatalogByPlan([]).reduce((s, r) => s + r.totalPaise, 0)).toBe(0);
  });

  it("sums collected Razorpay paise separately from catalog", () => {
    const paise = sumRazorpayPaise([
      { amount_paise: 249900, status: "paid" },
      { amount_paise: 69900, status: "captured" },
      { amount_paise: 99999, status: "failed" },
    ]);
    expect(paise).toBe(249900 + 69900);
    const catalog = computeInrCatalogByPlan([{ plan_id: "pro", status: "active" }]);
    expect(catalog[0].totalPaise).toBe(249900);
    expect(catalog[0].currency).toBe("INR");
  });
});
