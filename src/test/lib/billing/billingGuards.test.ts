import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CREDIT_PACK_DEFINITIONS } from "@/lib/constants/creditEconomics";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
/**
 * Pure billing guard assertions that mirror Edge Function catalog rules.
 */

const ACTIVE_LAUNCH_PLANS = new Set(["free", "pro", "enterprise"]);

function resolvePackCredits(packId: string | undefined, clientCredits: number): number {
  void clientCredits;
  const packs: Record<string, number> = {
    credits_50: 50,
    credits_150: 150,
    credits_500: 500,
  };
  return packId && packs[packId] != null ? packs[packId] : 0;
}

function isAllowedCheckoutPlan(planId: string, active: boolean): boolean {
  return active && ACTIVE_LAUNCH_PLANS.has(planId);
}

function rejectTestModeInProduction(appEnv: string, livemode: boolean): boolean {
  const prod = appEnv === "production" || appEnv === "prod";
  return !(prod && livemode === false);
}

/** Mirrors supabase/functions/_shared/billingConfig.ts isPlaceholder price rules. */
function isExamplePricePlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  const raw = value.trim();
  return (
    !v ||
    v.includes("changeme") ||
    v.includes("your_") ||
    v.includes("xxx") ||
    v.includes("placeholder") ||
    v === "test" ||
    v === "todo" ||
    /^price_(starter|pro|elite|enterprise|credits)(_\d+)?_(monthly|yearly)$/i.test(raw) ||
    /^price_credits_\d+$/i.test(raw)
  );
}

function rejectRazorpayTestKeyInProduction(appEnv: string, keyId: string): boolean {
  const prod = appEnv === "production" || appEnv === "prod";
  if (!prod) return true;
  return !keyId.trim().startsWith("rzp_test_");
}

describe("billing guards", () => {
  it("rejects .env.example Stripe price IDs as placeholders", () => {
    expect(isExamplePricePlaceholder("price_starter_monthly")).toBe(true);
    expect(isExamplePricePlaceholder("price_pro_yearly")).toBe(true);
    expect(isExamplePricePlaceholder("price_elite_monthly")).toBe(true);
    expect(isExamplePricePlaceholder("price_credits_50")).toBe(true);
    expect(isExamplePricePlaceholder("price_credits_150_monthly")).toBe(true);
    expect(isExamplePricePlaceholder("price_1AbCdEfGhIjKlMnOpQrStUv")).toBe(false);
  });

  it("ignores client-supplied credit quantity", () => {
    expect(resolvePackCredits("credits_50", 999_999)).toBe(50);
    expect(resolvePackCredits(undefined, 500)).toBe(0);
  });

  it("rejects inactive plans for new checkout", () => {
    expect(isAllowedCheckoutPlan("starter", false)).toBe(false);
    expect(isAllowedCheckoutPlan("elite", false)).toBe(false);
    expect(isAllowedCheckoutPlan("pro", true)).toBe(true);
    expect(isAllowedCheckoutPlan("enterprise", true)).toBe(true);
  });

  it("rejects Stripe test-mode objects in production", () => {
    expect(rejectTestModeInProduction("production", false)).toBe(false);
    expect(rejectTestModeInProduction("production", true)).toBe(true);
    expect(rejectTestModeInProduction("development", false)).toBe(true);
  });

  it("rejects Razorpay test keys in production", () => {
    expect(rejectRazorpayTestKeyInProduction("production", "rzp_test_abc")).toBe(false);
    expect(rejectRazorpayTestKeyInProduction("production", "rzp_live_abc")).toBe(true);
    expect(rejectRazorpayTestKeyInProduction("development", "rzp_test_abc")).toBe(true);
  });

  it("credit pack definitions are positive bounded amounts", () => {
    expect(CREDIT_PACK_DEFINITIONS.length).toBeGreaterThan(0);
    for (const pack of CREDIT_PACK_DEFINITIONS) {
      expect(pack.credits).toBeGreaterThan(0);
      expect(pack.credits).toBeLessThanOrEqual(500);
    }
  });

  it("billingConfig requires Razorpay webhook secret in production", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/billingConfig.ts"),
      "utf8",
    );
    expect(src).toContain("requireRazorpay && environment === \"production\"");
    expect(src).toContain("RAZORPAY_WEBHOOK_SECRET");
    expect(src).toContain("productionForbidsTestPrefix");
  });
});
