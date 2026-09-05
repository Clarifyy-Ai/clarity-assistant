import { describe, expect, it } from "vitest";
import {
  HELP_CREDITS_OVERVIEW_ANSWER,
  HELP_CATALOG_SNIPPETS,
  HELP_FREE_PLAN_ANSWER,
} from "@/lib/help/helpCatalogCopy";
import { PLAN_DEFINITIONS } from "@/types/billing.types";
import { PLAN_MONTHLY_CREDITS } from "@/lib/constants/creditEconomics";

describe("free credits product copy", () => {
  it("PLAN_DEFINITIONS free tier matches catalog signup grant", () => {
    expect(PLAN_DEFINITIONS.free.credits_monthly).toBe(PLAN_MONTHLY_CREDITS.free);
    expect(PLAN_DEFINITIONS.free.features[0]).toMatch(/50 credits at signup/i);
  });

  it("help overview does not claim monthly free refresh", () => {
    expect(HELP_CREDITS_OVERVIEW_ANSWER).toMatch(/at signup/i);
    expect(HELP_CREDITS_OVERVIEW_ANSWER).not.toMatch(/per month/i);
  });

  it("bi-4 rollover article reflects one-time free balance", () => {
    const bi4 = HELP_CATALOG_SNIPPETS["bi-4"];
    expect(bi4.answer).toMatch(/once at signup/i);
    expect(bi4.body_md).not.toMatch(/refresh each calendar month/i);
  });

  it("help free plan snippet does not claim monthly refresh", () => {
    expect(HELP_FREE_PLAN_ANSWER).toMatch(/at signup/i);
    expect(HELP_FREE_PLAN_ANSWER).not.toMatch(/per month/i);
    expect(HELP_CATALOG_SNIPPETS["gs-3"].body_md).not.toMatch(/per month/i);
  });
});
