import { describe, expect, it } from "vitest";
import {
  speakQuestionText,
  stopBrowserTts,
  unlockBrowserTts,
} from "@/lib/mock/mockTts";

describe("mockTts", () => {
  it("does not throw when speechSynthesis is unavailable", async () => {
    const original = globalThis.window;
    // @ts-expect-error test stub
    globalThis.window = {
      speechSynthesis: undefined,
    };
    const outcome = await speakQuestionText("Hello interviewer", {
      questionId: "q1",
      isCurrent: () => true,
    });
    expect(outcome.status).toBe("unavailable");
    globalThis.window = original;
  });

  it("stopBrowserTts is safe without speechSynthesis", () => {
    expect(() => stopBrowserTts()).not.toThrow();
  });

  it("unlockBrowserTts is safe without speechSynthesis", () => {
    expect(() => unlockBrowserTts()).not.toThrow();
  });

  it("returns a promise from speakQuestionText", async () => {
    const original = globalThis.window;
    // @ts-expect-error test stub
    globalThis.window = {
      speechSynthesis: undefined,
    };
    await expect(
      speakQuestionText("Test question text here", {
        questionId: "q2",
        isCurrent: () => true,
      }),
    ).resolves.toMatchObject({ status: expect.any(String) });
    globalThis.window = original;
  });
});
