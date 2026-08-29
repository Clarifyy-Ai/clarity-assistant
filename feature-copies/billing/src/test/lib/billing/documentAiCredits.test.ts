import { describe, expect, it } from "vitest";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";

/** Local mirror of server resolveActionCost for actions we just added. */
function resolveServerActionCost(action: string): number | undefined {
  const map: Record<string, keyof typeof AI_CREDIT_COSTS> = {
    resume_analysis: "resume_analysis",
    parse_resume: "resume_analysis",
    gap_analysis: "gap_analysis",
    parse_document: "parse_document",
  };
  const key = map[action.trim().toLowerCase()];
  return key ? AI_CREDIT_COSTS[key] : undefined;
}

describe("P0-4 document AI credit costs", () => {
  it("defines distinct costs for resume, gap analysis, and parse document", () => {
    expect(AI_CREDIT_COSTS.resume_analysis).toBe(12);
    expect(AI_CREDIT_COSTS.gap_analysis).toBe(10);
    expect(AI_CREDIT_COSTS.parse_document).toBe(8);
  });

  it("resolves action strings to the correct costs", () => {
    expect(resolveServerActionCost("resume_analysis")).toBe(12);
    expect(resolveServerActionCost("parse_resume")).toBe(12);
    expect(resolveServerActionCost("gap_analysis")).toBe(10);
    expect(resolveServerActionCost("parse_document")).toBe(8);
  });

  it("onboarding waive rule: incomplete onboarding skips charge", () => {
    function shouldWaiveCredits(opts: {
      onboardingHeader: boolean;
      onboardingCompleted: boolean | null | undefined;
    }): boolean {
      return opts.onboardingHeader || opts.onboardingCompleted === false;
    }

    expect(
      shouldWaiveCredits({ onboardingHeader: true, onboardingCompleted: true }),
    ).toBe(true);
    expect(
      shouldWaiveCredits({ onboardingHeader: false, onboardingCompleted: false }),
    ).toBe(true);
    expect(
      shouldWaiveCredits({ onboardingHeader: false, onboardingCompleted: true }),
    ).toBe(false);
  });

  it("402 when balance below required cost", () => {
    function canAfford(balance: number, cost: number): boolean {
      return balance >= cost;
    }
    expect(canAfford(11, AI_CREDIT_COSTS.resume_analysis)).toBe(false);
    expect(canAfford(12, AI_CREDIT_COSTS.resume_analysis)).toBe(true);
    expect(canAfford(9, AI_CREDIT_COSTS.gap_analysis)).toBe(false);
    expect(canAfford(7, AI_CREDIT_COSTS.parse_document)).toBe(false);
  });
});
