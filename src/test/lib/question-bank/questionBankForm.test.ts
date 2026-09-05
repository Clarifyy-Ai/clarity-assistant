import { describe, expect, it } from "vitest";
import {
  buildMcqOptions,
  buildOptionText,
  mcqFieldsFromOptions,
  normalizeTrueFalseAnswer,
  optionsForQuestionType,
  parseOptionText,
  trueFalseLabelFromAnswer,
} from "@/lib/question-bank/questionBankForm";

describe("questionBankForm", () => {
  it("parses option text with trailing image URL", () => {
    expect(parseOptionText("Paris\nhttps://example.com/map.png")).toEqual({
      text: "Paris",
      imageUrl: "https://example.com/map.png",
    });
    expect(parseOptionText("https://example.com/only.png")).toEqual({
      text: "",
      imageUrl: "https://example.com/only.png",
    });
  });

  it("builds MCQ options with optional images", () => {
    const options = buildMcqOptions({
      option_a: "Yes",
      option_b: "",
      option_c: "Maybe",
      option_d: "",
      option_a_image: "",
      option_b_image: "https://example.com/b.png",
      option_c_image: "",
      option_d_image: "",
    });
    expect(options).toEqual([
      { label: "A", text: "Yes" },
      { label: "B", text: "https://example.com/b.png" },
      { label: "C", text: "Maybe" },
    ]);
  });

  it("round-trips MCQ fields from stored options", () => {
    const fields = mcqFieldsFromOptions([
      { label: "A", text: "Alpha\nhttps://example.com/a.png" },
      { label: "B", text: "Beta" },
    ]);
    expect(fields.option_a).toBe("Alpha");
    expect(fields.option_a_image).toBe("https://example.com/a.png");
    expect(fields.option_b).toBe("Beta");
  });

  it("normalizes true/false answers", () => {
    expect(normalizeTrueFalseAnswer("True")).toBe("A");
    expect(normalizeTrueFalseAnswer("FALSE")).toBe("B");
    expect(trueFalseLabelFromAnswer("B")).toBe("False");
  });

  it("builds true/false options on save", () => {
    const built = optionsForQuestionType({
      question_type: "TRUE_FALSE",
      mcq: {
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
        option_a_image: "",
        option_b_image: "",
        option_c_image: "",
        option_d_image: "",
      },
      correct_answer: "False",
    });
    expect(built.options).toEqual([
      { label: "A", text: "True" },
      { label: "B", text: "False" },
    ]);
    expect(built.correct_answer).toBe("B");
  });

  it("combines text and image in buildOptionText", () => {
    expect(buildOptionText("Label", "https://example.com/x.png")).toBe(
      "Label\nhttps://example.com/x.png",
    );
  });
});
