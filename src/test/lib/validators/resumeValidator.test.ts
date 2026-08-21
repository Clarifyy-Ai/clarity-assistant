import { describe, expect, it } from "vitest";
import { validateInterviewContext, validateQAPair } from "@/lib/validators/resumeValidator";

describe("resume and interview input validation", () => {
  it("rejects malformed technology entries instead of throwing", () => {
    expect(() => validateInterviewContext({ techStack: ["TypeScript", null as unknown as string] })).not.toThrow();
    expect(validateInterviewContext({ techStack: ["TypeScript", null as unknown as string] }).techStack).toBeTruthy();
  });

  it("rejects blank and malformed answer-bank tags", () => {
    const result = validateQAPair({
      question: "Tell me about a project you built?",
      answer: "I led the implementation and measured the result.",
      tags: ["behavioral", "   "],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.tags).toBeTruthy();
  });
});
