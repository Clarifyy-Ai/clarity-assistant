import { describe, expect, it } from "vitest";
import { parseGeminiSseData } from "@/lib/ai/geminiSseParse";

describe("parseGeminiSseData", () => {
  it("yields incremental text from a Gemini candidate part", () => {
    const delta = parseGeminiSseData(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Hello" }] } }],
      }),
    );
    expect(delta).toBe("Hello");
  });

  it("returns null for keep-alive / empty payloads", () => {
    expect(parseGeminiSseData("")).toBeNull();
    expect(parseGeminiSseData("[DONE]")).toBeNull();
    expect(parseGeminiSseData("{not-json")).toBeNull();
    expect(
      parseGeminiSseData(JSON.stringify({ candidates: [{ content: { parts: [] } }] })),
    ).toBeNull();
  });

  it("throws before any text when Gemini reports an error object", () => {
    expect(() =>
      parseGeminiSseData(
        JSON.stringify({ error: { code: 429, message: "Resource exhausted" } }),
      ),
    ).toThrow(/429/);
  });
});
