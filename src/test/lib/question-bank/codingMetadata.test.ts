import { describe, expect, it } from "vitest";
import {
  buildQuestionCodingMetadata,
  CODING_AUTO_CORRECT_ANSWER,
  DEFAULT_CODING_FORM_FIELDS,
  parseQuestionCodingMetadata,
  stripCodingMetadataForPlay,
  wrapQuestionMetadata,
} from "@/lib/question-bank/codingMetadata";

describe("codingMetadata", () => {
  it("builds and parses coding metadata", () => {
    const built = buildQuestionCodingMetadata(DEFAULT_CODING_FORM_FIELDS);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const wrapped = wrapQuestionMetadata(built.metadata);
    const parsed = parseQuestionCodingMetadata(wrapped);
    expect(parsed?.language).toBe("javascript");
    expect(parsed?.test_cases).toHaveLength(2);
  });

  it("strips hidden cases for playable attempts", () => {
    const built = buildQuestionCodingMetadata(DEFAULT_CODING_FORM_FIELDS);
    if (!built.ok) return;
    const playable = stripCodingMetadataForPlay(built.metadata);
    expect(playable?.test_cases).toHaveLength(1);
    expect(playable?.test_cases[0]?.name).toBe("sample");
  });

  it("uses auto correct answer sentinel", () => {
    expect(CODING_AUTO_CORRECT_ANSWER).toBe("__CODING_AUTO__");
  });
});
