import { describe, expect, it } from "vitest";
import {
  isAllowedOnboardingInterviewDate,
  isMeaningfulDisplayName,
  onboardingEssentialsSchema,
} from "@/lib/onboarding/schema";

describe("onboarding essentials schema", () => {
  it("rejects meaningless names", () => {
    expect(isMeaningfulDisplayName("asdf")).toBe(false);
    expect(isMeaningfulDisplayName("test")).toBe(false);
    expect(isMeaningfulDisplayName("aaa")).toBe(false);
    expect(isMeaningfulDisplayName("1234")).toBe(false);
    expect(isMeaningfulDisplayName("A")).toBe(false);
    expect(onboardingEssentialsSchema.safeParse({ fullName: "qwerty" }).success).toBe(false);
  });

  it("accepts a real name", () => {
    expect(isMeaningfulDisplayName("Jane Smith")).toBe(true);
    expect(onboardingEssentialsSchema.safeParse({ fullName: "Jane Smith" }).success).toBe(true);
  });

  it("rejects past interview dates and dates more than two years out", () => {
    const now = new Date("2026-09-02T12:00:00");
    expect(isAllowedOnboardingInterviewDate("2026-09-01", now)).toBe(false);
    expect(isAllowedOnboardingInterviewDate("2026-09-02", now)).toBe(true);
    expect(isAllowedOnboardingInterviewDate("2029-01-01", now)).toBe(false);
    expect(isAllowedOnboardingInterviewDate("", now)).toBe(true);
    expect(
      onboardingEssentialsSchema.safeParse({
        fullName: "Jane Smith",
        interviewDate: "2020-01-01",
      }).success,
    ).toBe(false);
  });
});
