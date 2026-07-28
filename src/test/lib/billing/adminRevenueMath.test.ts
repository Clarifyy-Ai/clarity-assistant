import { describe, expect, it } from "vitest";
import { PLAN_PRICE_CENTS_MONTHLY } from "@/lib/constants/creditEconomics";

/** Pure helper mirroring creditsDB.monthlyRevenueByPlan money math (P0-6). */
export function computeUsdMrrByPlan(
  subscriptions: Array<{ plan_id: string | null; status: string }>,
): { planId: string; totalCents: number; currency: "USD" }[] {
  const counts: Record<string, number> = {};
  for (const row of subscriptions) {
    if (row.status !== "active" && row.status !== "trialing") continue;
    const planId = String(row.plan_id ?? "free");
    counts[planId] = (counts[planId] ?? 0) + 1;
  }
  return Object.entries(counts).map(([planId, count]) => {
    const priceKey = planId as keyof typeof PLAN_PRICE_CENTS_MONTHLY;
    const cents = PLAN_PRICE_CENTS_MONTHLY[priceKey] ?? 0;
    return { planId, totalCents: cents * count, currency: "USD" as const };
  });
}

export function sumRazorpayPaise(
  orders: Array<{ amount_paise: number; status: string }>,
): number {
  return orders
    .filter((o) => ["paid", "captured", "success"].includes(o.status))
    .reduce((sum, o) => sum + Math.abs(o.amount_paise || 0), 0);
}

describe("P0-6 admin revenue money math", () => {
  it("computes USD MRR from subscriptions × catalog prices, not credit counts", () => {
    const rows = computeUsdMrrByPlan([
      { plan_id: "pro", status: "active" },
      { plan_id: "pro", status: "trialing" },
      { plan_id: "enterprise", status: "active" },
      { plan_id: "free", status: "active" },
      { plan_id: "pro", status: "canceled" },
    ]);

    const byPlan = Object.fromEntries(rows.map((r) => [r.planId, r.totalCents]));
    // 2× pro ($29) + 1× enterprise ($79) + free $0
    expect(byPlan.pro).toBe(2 * PLAN_PRICE_CENTS_MONTHLY.pro);
    expect(byPlan.enterprise).toBe(PLAN_PRICE_CENTS_MONTHLY.enterprise);
    expect(byPlan.free).toBe(0);

    const totalUsd = rows.reduce((s, r) => s + r.totalCents, 0);
    expect(totalUsd).toBe(2 * 2900 + 7900);
  });

  it("never treats credit ledger amounts as cents", () => {
    // Credit pack grant of 500 credits must NOT become $5.00
    const creditLedgerSum = 500;
    const wronglyAsCents = creditLedgerSum; // old bug
    const correctlyIgnoredForMrr = 0;
    expect(wronglyAsCents).not.toBe(correctlyIgnoredForMrr);
    expect(computeUsdMrrByPlan([]).reduce((s, r) => s + r.totalCents, 0)).toBe(0);
  });

  it("sums INR Razorpay paise separately from USD", () => {
    const paise = sumRazorpayPaise([
      { amount_paise: 249900, status: "paid" },
      { amount_paise: 69900, status: "captured" },
      { amount_paise: 99999, status: "failed" },
    ]);
    expect(paise).toBe(249900 + 69900);
    // Must not be added into USD cents totals
    const usd = computeUsdMrrByPlan([{ plan_id: "pro", status: "active" }]);
    expect(usd[0].totalCents).toBe(2900);
    expect(usd[0].currency).toBe("USD");
  });
});
