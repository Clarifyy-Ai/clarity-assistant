import { describe, expect, it } from "vitest";
import {
  deriveQuestionPaletteState,
  deriveResponseFromRow,
  palettePresentation,
} from "@/lib/gov-exam/questionPalette";

describe("question palette status model", () => {
  it("derives a single status and presentation from answer + mark flags", () => {
    expect(deriveQuestionPaletteState({})).toBe("unattempted");
    expect(deriveQuestionPaletteState({ visited: true })).toBe("visited");
    expect(deriveQuestionPaletteState({ answer: "B" })).toBe("answered");
    expect(deriveQuestionPaletteState({ isMarkedReview: true })).toBe("marked");
    expect(deriveQuestionPaletteState({ answer: "B", isMarkedReview: true })).toBe("answered-marked");
    expect(palettePresentation("answered").label).toMatch(/Answered/);
  });

  it("maps persisted response rows without a second stored presentation", () => {
    expect(
      deriveResponseFromRow({
        user_answer: "A",
        is_attempted: true,
        is_marked_review: true,
      }).state,
    ).toBe("answered-marked");
  });
});
