import { describe, expect, it } from "vitest";
import {
  extractStemImageUrls,
  isUsableQuestionImageUrl,
  sanitizeQuestionStem,
  uniqueImageUrls,
} from "@/lib/mock-test/questionMedia";
import {
  dedupeExactQuestionCopies,
  dedupeQuestionsByStem,
} from "@/lib/mock-test/dedupeQuestions";

describe("question media", () => {
  it("rejects placeholder and caption URLs", () => {
    expect(isUsableQuestionImageUrl("")).toBe(false);
    expect(isUsableQuestionImageUrl("Reference Image")).toBe(false);
    expect(
      isUsableQuestionImageUrl("https://placehold.co/600x200?text=Reference+Image"),
    ).toBe(false);
    expect(isUsableQuestionImageUrl("https://via.placeholder.com/400")).toBe(false);
    expect(isUsableQuestionImageUrl("diagram.png")).toBe(true);
    expect(
      isUsableQuestionImageUrl("https://xyz.supabase.co/storage/v1/object/public/question-images/a.png"),
    ).toBe(true);
  });

  it("strips markdown placeholders and duplicated paragraphs", () => {
    const stem = [
      "If $\\alpha$ and $\\beta$ are roots, find $\\alpha^{2}+\\beta^{2}$.",
      "",
      "![Reference Image](https://placehold.co/400x200?text=Reference+Image)",
      "",
      "If $\\alpha$ and $\\beta$ are roots, find $\\alpha^{2}+\\beta^{2}$.",
    ].join("\n");
    const cleaned = sanitizeQuestionStem(stem);
    expect(cleaned).toContain("alpha");
    expect(cleaned.toLowerCase()).not.toContain("reference image");
    expect(cleaned.split("are roots").length - 1).toBe(1);
  });

  it("extracts only usable markdown images", () => {
    expect(
      extractStemImageUrls("See ![fig](https://cdn.example.com/q1.png) and ![x](https://placehold.co/1)"),
    ).toEqual(["https://cdn.example.com/q1.png"]);
    expect(uniqueImageUrls("Reference Image", "nope")).toEqual([]);
  });
});

describe("dedupeQuestionsByStem", () => {
  it("drops the same JEE stem stored under two ids", () => {
    const a =
      "If $\\alpha$ and $\\beta$ are the roots of the equation $x^2 - x + 1 = 0$, then the value of $\\alpha^{2023} + \\beta^{2023}$ is:";
    const b =
      "If α and β are the roots of the equation x^2 - x + 1 = 0, then the value of α^{2023} + β^{2023} is:";
    const out = dedupeQuestionsByStem([
      { id: "1", question_text: a, options: ["-1", "1", "0", "2"] },
      { id: "2", question_text: b, options: ["-1", "1", "0", "2"] },
      { id: "3", question_text: "What is the derivative of sin x?", options: ["cos x", "-cos x", "tan x", "1"] },
    ]);
    expect(out.map((q) => q.id)).toEqual(["1", "3"]);
  });
});

describe("dedupeExactQuestionCopies", () => {
  it("keeps related topic questions that are not identical copies", () => {
    const out = dedupeExactQuestionCopies([
      {
        id: "a",
        question_text: "Base year for CPI is often cited as:",
        options: ["2004-05", "2011-12", "2012", "1993-94"],
      },
      {
        id: "b",
        question_text: "Which body publishes CPI in India?",
        options: ["RBI", "NSO", "SEBI", "NITI Aayog"],
      },
      {
        id: "a",
        question_text: "Base year for CPI is often cited as:",
        options: ["2004-05", "2011-12", "2012", "1993-94"],
      },
    ]);
    expect(out.map((q) => q.id)).toEqual(["a", "b"]);
  });
});
