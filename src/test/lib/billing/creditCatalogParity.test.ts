import { describe, expect, it } from "vitest";
import {
  CREDIT_CATALOG_VERSION,
  CREDIT_PACK_DEFINITIONS,
  PLAN_MONTHLY_CREDITS,
} from "@/lib/constants/creditEconomics";
import { HELP_ARTICLES_FALLBACK } from "@/lib/constants/helpArticlesFallback";

describe("credit catalog parity", () => {
  it("exposes a versioned catalog", () => {
    expect(CREDIT_CATALOG_VERSION).toMatch(/^credit_catalog_/);
    expect(PLAN_MONTHLY_CREDITS.free).toBe(50);
    expect(PLAN_MONTHLY_CREDITS.pro).toBe(1400);
    expect(PLAN_MONTHLY_CREDITS.enterprise).toBe(4000);
    expect(CREDIT_PACK_DEFINITIONS.map((p) => p.credits)).toEqual([50, 150, 500]);
  });

  it("Help fallback uses the same plan and pack amounts", () => {
    const text = HELP_ARTICLES_FALLBACK.map((a) => `${a.answer}\n${a.body_md ?? ""}`).join("\n");
    expect(text).toContain(String(PLAN_MONTHLY_CREDITS.free));
    expect(text).toContain(String(PLAN_MONTHLY_CREDITS.pro));
    expect(text).toContain(String(PLAN_MONTHLY_CREDITS.enterprise));
    expect(text).toMatch(/150/);
    expect(text).toMatch(/500/);
    expect(text).not.toMatch(/packs are not available/i);
    expect(text).not.toMatch(/credits refresh monthly based on your plan/i);
  });
});
