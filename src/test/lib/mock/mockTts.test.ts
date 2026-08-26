import { describe, expect, it } from "vitest";
import { speakQuestionText, stopBrowserTts } from "@/lib/mock/mockTts";

describe("mockTts", () => {
  it("does not throw when speechSynthesis is unavailable", () => {
    const original = globalThis.window;
    // @ts-expect-error test stub
    globalThis.window = {
      speechSynthesis: undefined,
    };
    expect(() =>
      speakQuestionText("Hello interviewer", {
        questionId: "q1",
        isCurrent: () => true,
      }),
    ).not.toThrow();
    globalThis.window = original;
  });

  it("stopBrowserTts is safe without speechSynthesis", () => {
    expect(() => stopBrowserTts()).not.toThrow();
  });
});
