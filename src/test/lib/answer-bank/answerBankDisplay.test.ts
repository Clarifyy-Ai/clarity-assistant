import { describe, expect, it } from "vitest";
import {
  answerBankDetailTitle,
  buildRephraserAnswerBankPayload,
  isLegacyRephraserEntry,
  shouldShowQuestionSection,
} from "@/lib/answer-bank/answerBankDisplay";

describe("answerBankDisplay", () => {
  it("stores original text and style tag for rephraser saves", () => {
    expect(
      buildRephraserAnswerBankPayload(
        "I kind of led the migration project.",
        "concise",
        "Successfully led a high-impact team project to completion.",
      ),
    ).toEqual({
      question_text: "I kind of led the migration project.",
      answer_text: "Successfully led a high-impact team project to completion.",
      source: "prep_lab",
      tags: ["rephraser", "concise"],
      category: "General",
    });
  });

  it("shows rephraser style in title while keeping original in body", () => {
    const entry = buildRephraserAnswerBankPayload("Original draft", "concise", "Improved");
    expect(answerBankDetailTitle(entry)).toBe("Rephrased answer (Concise)");
    expect(shouldShowQuestionSection(entry)).toBe(true);
  });

  it("detects legacy rephraser rows with label-only question_text", () => {
    const legacy = {
      question_text: "Rephrased answer (Concise)",
      tags: null,
      source: "prep_lab" as const,
    };
    expect(isLegacyRephraserEntry(legacy)).toBe(true);
    expect(shouldShowQuestionSection(legacy)).toBe(false);
    expect(answerBankDetailTitle(legacy)).toBe("Rephrased answer (Concise)");
  });
});
