import { describe, expect, it } from "vitest";
import {
  draftFromAnswerBankEntry,
  practiceContextLaunchPath,
  shouldHydrateLastPracticeSetup,
  unspecifiedLabel,
} from "@/lib/session/practiceContext";

describe("practice context", () => {
  it("never copies stale lastSetup fields from Answer Bank", () => {
    const draft = draftFromAnswerBankEntry({
      id: "ans-1",
      question_text: "Tell me about a time you led a migration",
      category: "leadership",
    });
    expect(draft.role).toBeNull();
    expect(draft.company).toBeNull();
    expect(draft.resume_id).toBeNull();
    expect(draft.jd_id).toBeNull();
    expect(draft.source_type).toBe("answer_bank");
    expect(draft.question_text).toContain("migration");
  });

  it("shows Not specified when role is missing", () => {
    expect(unspecifiedLabel(null)).toBe("Not specified");
    expect(unspecifiedLabel("  ")).toBe("Not specified");
    expect(unspecifiedLabel("PM")).toBe("PM");
  });

  it("skips lastPracticeSetup hydration when a context id is present", () => {
    expect(shouldHydrateLastPracticeSetup({ practiceContextId: "ctx-1" })).toBe(false);
    expect(shouldHydrateLastPracticeSetup({ practiceContextId: null })).toBe(true);
  });

  it("launches with context query only", () => {
    expect(practiceContextLaunchPath("abc")).toBe("/app/live?context=abc");
  });
});
