import { describe, expect, it } from "vitest";
import {
  applyApprovedTranslations,
  canUseTranslation,
  isEnglishLanguage,
  normalizeQuestionLanguage,
  selectQuestionDisplayText,
} from "@/lib/gov-exam/questionTranslations";
import { canSetTranslationReviewState } from "@/lib/gov-exam/adminOps";

describe("question translation selection", () => {
  const base = {
    id: "q1",
    question_text: "What is 2+2?",
    options: [
      { label: "A", text: "3" },
      { label: "B", text: "4" },
    ],
    explanation: "Basic arithmetic",
  };

  const approvedHi = {
    question_text: "2+2 क्या है?",
    options: [
      { label: "A", text: "३" },
      { label: "B", text: "४" },
    ],
    explanation: "सामान्य अंकगणित",
    review_state: "approved",
    language: "hi",
  };

  it("normalizes language tags", () => {
    expect(normalizeQuestionLanguage("Hindi")).toBe("hi");
    expect(normalizeQuestionLanguage("hi-IN")).toBe("hi");
    expect(normalizeQuestionLanguage("English")).toBe("en");
    expect(normalizeQuestionLanguage("en-US")).toBe("en");
    expect(normalizeQuestionLanguage("ta")).toBe("ta");
    expect(isEnglishLanguage("en")).toBe(true);
    expect(isEnglishLanguage("hi")).toBe(false);
  });

  it("only approved translations are usable", () => {
    expect(canUseTranslation(approvedHi)).toBe(true);
    expect(canUseTranslation({ ...approvedHi, review_state: "needs_review" })).toBe(false);
    expect(canUseTranslation({ ...approvedHi, review_state: "draft" })).toBe(false);
    expect(canUseTranslation({ ...approvedHi, review_state: "rejected" })).toBe(false);
    expect(canUseTranslation(null)).toBe(false);
  });

  it("selects Hindi when approved translation exists", () => {
    const result = selectQuestionDisplayText(base, approvedHi, "hi");
    expect(result.usedTranslation).toBe(true);
    expect(result.displayLanguage).toBe("hi");
    expect(result.question_text).toBe("2+2 क्या है?");
    expect(result.options).toEqual(approvedHi.options);
    expect(result.explanation).toBe("सामान्य अंकगणित");
  });

  it("keeps English when language is en even if translation exists", () => {
    const result = selectQuestionDisplayText(base, approvedHi, "en");
    expect(result.usedTranslation).toBe(false);
    expect(result.question_text).toBe(base.question_text);
  });

  it("does not apply needs_review machine drafts", () => {
    const draft = { ...approvedHi, review_state: "needs_review" };
    const result = selectQuestionDisplayText(base, draft, "hi");
    expect(result.usedTranslation).toBe(false);
    expect(result.question_text).toBe(base.question_text);
  });

  it("falls back to English when no translation for language", () => {
    const result = selectQuestionDisplayText(base, undefined, "ta");
    expect(result.usedTranslation).toBe(false);
    expect(result.displayLanguage).toBe("en");
  });

  it("keeps base options/explanation when translation omits them", () => {
    const partial = {
      question_text: "अनुवादित प्रश्न",
      review_state: "approved",
    };
    const result = selectQuestionDisplayText(base, partial, "hi");
    expect(result.usedTranslation).toBe(true);
    expect(result.options).toEqual(base.options);
    expect(result.explanation).toBe(base.explanation);
  });

  it("applies map of approved translations by question id", () => {
    const qs = [
      base,
      { ...base, id: "q2", question_text: "Capital of India?" },
    ];
    const applied = applyApprovedTranslations(
      qs,
      {
        q1: approvedHi,
      },
      "hi",
    );
    expect(applied[0].usedTranslation).toBe(true);
    expect(applied[0].question_text).toBe("2+2 क्या है?");
    expect(applied[1].usedTranslation).toBe(false);
    expect(applied[1].question_text).toBe("Capital of India?");
  });

  it("validates translation review states", () => {
    expect(canSetTranslationReviewState("needs_review")).toBe(true);
    expect(canSetTranslationReviewState("approved")).toBe(true);
    expect(canSetTranslationReviewState("bogus")).toBe(false);
  });
});
