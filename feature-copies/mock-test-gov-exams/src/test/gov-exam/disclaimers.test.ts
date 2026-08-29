import { describe, expect, it } from "vitest";
import {
  AI_GENERATED_PAPER_LABEL,
  CUSTOM_PRACTICE_PAPER_LABEL,
  OFFICIAL_PREVIOUS_PAPER_LABEL,
  PAPER_CLASS_SHORT_LABELS,
  parsePaperClass,
  primaryActionInsight,
  resolvePaperClassPresentation,
} from "@/lib/gov-exam/disclaimers";

describe("paper class labels", () => {
  it("parses known paper classes only", () => {
    expect(parsePaperClass("ai_generated")).toBe("ai_generated");
    expect(parsePaperClass("official_previous")).toBe("official_previous");
    expect(parsePaperClass("custom_practice")).toBe("custom_practice");
    expect(parsePaperClass("leaked")).toBeNull();
    expect(parsePaperClass(null)).toBeNull();
  });

  it("maps distinct short labels and fallbacks disclaimer from paper_class", () => {
    expect(PAPER_CLASS_SHORT_LABELS.ai_generated).toMatch(/AI-generated/i);
    expect(PAPER_CLASS_SHORT_LABELS.official_previous).toMatch(/Previous-year/i);
    expect(PAPER_CLASS_SHORT_LABELS.custom_practice).toMatch(/Custom/i);

    expect(resolvePaperClassPresentation({ paper_class: "ai_generated" })).toEqual({
      paperClass: "ai_generated",
      shortLabel: PAPER_CLASS_SHORT_LABELS.ai_generated,
      disclaimer: AI_GENERATED_PAPER_LABEL,
    });
    expect(resolvePaperClassPresentation({ paper_class: "official_previous" }).disclaimer)
      .toBe(OFFICIAL_PREVIOUS_PAPER_LABEL);
    expect(resolvePaperClassPresentation({ paper_class: "custom_practice" }).disclaimer)
      .toBe(CUSTOM_PRACTICE_PAPER_LABEL);
  });

  it("prefers stored disclaimer from mock_tests.config", () => {
    const stored = "Stored config disclaimer for this paper.";
    const result = resolvePaperClassPresentation({
      paper_class: "ai_generated",
      disclaimer: stored,
    });
    expect(result.disclaimer).toBe(stored);
    expect(result.shortLabel).toBe(PAPER_CLASS_SHORT_LABELS.ai_generated);
  });
});

describe("primaryActionInsight", () => {
  it("leads with weak topics when present", () => {
    expect(
      primaryActionInsight({
        weak_topics: ["Percentages", "Syllogism"],
        subject_breakdown: { Quant: { accuracy: 40 } },
      }),
    ).toMatch(/Percentages and Syllogism/);
  });

  it("falls back to weakest subject accuracy", () => {
    expect(
      primaryActionInsight({
        subject_breakdown: {
          English: { accuracy: 80, attempted: 10, correct: 8 },
          Quant: { accuracy: 35, attempted: 10, correct: 3 },
        },
      }),
    ).toMatch(/Quant/);
  });

  it("returns null without useful breakdown", () => {
    expect(primaryActionInsight({})).toBeNull();
  });
});
