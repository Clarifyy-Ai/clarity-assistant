import { describe, expect, it } from "vitest";
import { normalizeFeedbackItems } from "@/lib/scorecard/normalizeFeedbackItems";

describe("normalizeFeedbackItems", () => {
  it("returns empty array for null, undefined, and all-blank lists", () => {
    expect(normalizeFeedbackItems(null)).toEqual([]);
    expect(normalizeFeedbackItems(undefined)).toEqual([]);
    expect(normalizeFeedbackItems(["", "  ", null as unknown as string])).toEqual([]);
  });

  it("keeps trimmed non-empty strings", () => {
    expect(normalizeFeedbackItems([" Clear structure ", "Add metrics"])).toEqual([
      "Clear structure",
      "Add metrics",
    ]);
  });
});
