import { describe, it, expect } from "vitest";
import {
  isInterviewerQuestionText,
  isLikelyInterviewerQuestion,
} from "@/lib/audio/interviewerQuestion";

describe("isInterviewerQuestionText", () => {
  it("accepts a tell-me behavioral prompt", () => {
    expect(isInterviewerQuestionText("Tell me about a time you failed")).toBe(
      true,
    );
  });

  it("accepts a how-would-you design question", () => {
    expect(
      isInterviewerQuestionText("How would you design a rate limiter?"),
    ).toBe(true);
  });

  it("does not treat candidate speech with you/your as a question", () => {
    expect(
      isInterviewerQuestionText(
        "yeah I worked on that last year with your team",
      ),
    ).toBe(false);
  });

  it("rejects short fillers", () => {
    expect(isInterviewerQuestionText("ok")).toBe(false);
  });

  it("accepts a direct technical question", () => {
    expect(isInterviewerQuestionText("What is CAP theorem?")).toBe(true);
  });

  it("rejects length under 12 even with a question mark", () => {
    expect(isInterviewerQuestionText("What?")).toBe(false);
  });

  it("rejects 1–2 words that are not questions", () => {
    expect(isInterviewerQuestionText("go ahead please")).toBe(false);
    expect(isInterviewerQuestionText("sounds good")).toBe(false);
  });

  it("rejects filler-heavy strings", () => {
    expect(isInterviewerQuestionText("um um um um")).toBe(false);
    expect(isInterviewerQuestionText("okay okay okay")).toBe(false);
    expect(isInterviewerQuestionText("so yeah")).toBe(false);
  });

  it("trims whitespace before evaluating", () => {
    expect(isInterviewerQuestionText("   ok   ")).toBe(false);
    expect(isInterviewerQuestionText("  What is CAP theorem?  ")).toBe(true);
  });

  it("exports isLikelyInterviewerQuestion as an alias", () => {
    expect(isLikelyInterviewerQuestion).toBe(isInterviewerQuestionText);
  });
});
