import { describe, expect, it, beforeEach } from "vitest";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "@/lib/onboarding/draft";

describe("onboarding draft", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists step and values across save/load", () => {
    saveOnboardingDraft(2, { targetRole: "SWE", currentLevel: "mid", interviewAnxiety: 4 });
    const draft = loadOnboardingDraft();
    expect(draft?.step).toBe(2);
    expect(draft?.data.targetRole).toBe("SWE");
    expect(draft?.data.interviewAnxiety).toBe(4);
  });

  it("clears the draft", () => {
    saveOnboardingDraft(1, { targetRole: "PM" });
    clearOnboardingDraft();
    expect(loadOnboardingDraft()).toBeNull();
  });
});
