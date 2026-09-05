import { describe, expect, it } from "vitest";
import { mockSessionCreditCost } from "@/lib/constants/creditEconomics";

describe("mockSessionCreditCost", () => {
  it("uses ceil(q/5*15) formula for five-question baseline", () => {
    expect(mockSessionCreditCost(5)).toBe(15);
    expect(mockSessionCreditCost(10)).toBe(30);
    expect(mockSessionCreditCost(3)).toBe(9);
  });

  it("returns minimum cost for zero questions (clamped to 1)", () => {
    expect(mockSessionCreditCost(0)).toBe(3);
  });
});
