import { describe, expect, it } from "vitest";
import {
  normalizeMcqOptions,
  optionText,
  optionsForStorage,
  validateSingleCorrectMcq,
} from "@/lib/gov-exam/mcqValidator";

describe("normalizeMcqOptions", () => {
  it("reads {label,text} bank options instead of String(object)", () => {
    const raw = [
      { label: "A", text: "New Delhi" },
      { label: "B", text: "Mumbai" },
      { label: "C", text: "Kolkata" },
      { label: "D", text: "Chennai" },
    ];
    const options = normalizeMcqOptions(raw);
    expect(options).toEqual(["New Delhi", "Mumbai", "Kolkata", "Chennai"]);
    expect(options.every((o) => o !== "[object Object]")).toBe(true);

    const mcq = validateSingleCorrectMcq({
      question_text: "What is the capital of India as of 2024?",
      options,
      correct_index: 0,
    });
    expect(mcq.ok).toBe(true);
  });

  it("hard-fails if options are stringified objects (legacy assembly bug)", () => {
    const broken = [
      { label: "A", text: "One" },
      { label: "B", text: "Two" },
      { label: "C", text: "Three" },
      { label: "D", text: "Four" },
    ].map((o) => String(o));
    expect(new Set(broken).size).toBe(1);
    const mcq = validateSingleCorrectMcq({
      question_text: "Which of the following is a prime number in this list?",
      options: broken,
      correct_index: 0,
    });
    expect(mcq.ok).toBe(false);
  });

  it("round-trips storage objects", () => {
    const stored = optionsForStorage(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(stored[0]).toEqual({ label: "A", text: "Alpha" });
    expect(normalizeMcqOptions(stored)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(optionText({ label: "B", text: "Beta" })).toBe("Beta");
  });
});
