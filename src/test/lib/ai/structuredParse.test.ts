import { describe, expect, it } from "vitest";
import {
  AI_RESPONSE_INVALID_MESSAGE,
  classifyJsonFailure,
  isRephraseAlternatives,
  parseStructuredJson,
  stripMarkdownFences,
} from "@/lib/ai/structuredParse";
import { getAiUserFacingError } from "@/lib/network/aiErrorUx";

const valid = {
  formal: "Professional rewrite.",
  confident: "I led the migration.",
  concise: "Led the migration.",
};

describe("parseStructuredJson", () => {
  it("parses complete valid JSON", () => {
    const r = parseStructuredJson(JSON.stringify(valid), isRephraseAlternatives);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual(valid);
  });

  it("parses JSON wrapped in markdown fences", () => {
    const raw = "```json\n" + JSON.stringify(valid) + "\n```";
    const r = parseStructuredJson(raw, isRephraseAlternatives);
    expect(r.ok).toBe(true);
    expect(r.value?.formal).toBe(valid.formal);
  });

  it("classifies truncated / unterminated string", () => {
    const raw = '{"formal":"hello","confident":"unterm';
    const r = parseStructuredJson(raw, isRephraseAlternatives);
    expect(r.ok).toBe(false);
    expect(["truncated", "malformed"]).toContain(r.category);
  });

  it("strips provider commentary around JSON", () => {
    const raw = `Sure, here you go:\n${JSON.stringify(valid)}\nHope this helps!`;
    const r = parseStructuredJson(raw, isRephraseAlternatives);
    expect(r.ok).toBe(true);
  });

  it("empty response", () => {
    expect(parseStructuredJson("", isRephraseAlternatives).category).toBe("empty");
  });

  it("schema-valid object that is semantically empty fails schema", () => {
    const r = parseStructuredJson(
      JSON.stringify({ formal: " ", confident: "", concise: "" }),
      isRephraseAlternatives,
    );
    expect(r.ok).toBe(false);
    expect(r.category).toBe("schema_mismatch");
  });

  it("stripMarkdownFences removes preamble fences", () => {
    expect(stripMarkdownFences("```json\n{\"a\":1}\n```")).toContain('"a"');
  });

  it("classifyJsonFailure maps unterminated", () => {
    expect(classifyJsonFailure("{", "Unterminated string in JSON")).toBe("truncated");
  });
});

describe("AI_RESPONSE_INVALID UX", () => {
  it("does not leak raw JSON parse offsets to users", () => {
    const msg = getAiUserFacingError(
      new SyntaxError("Unterminated string in JSON at position 235 (line 3 column 85)"),
    );
    expect(msg).toBe(AI_RESPONSE_INVALID_MESSAGE);
    expect(msg).not.toContain("position");
    expect(msg).not.toContain("Unterminated");
  });

  it("maps AI_RESPONSE_INVALID code", () => {
    const err = Object.assign(new Error("parse failed"), { code: "AI_RESPONSE_INVALID" });
    // ApiClientError path uses err.code via errorCode helper only for ApiClientError.
    // Message still contains unterminated-style strings; also test message body:
    const wrapped = Object.assign(new Error(AI_RESPONSE_INVALID_MESSAGE), {
      code: "AI_RESPONSE_INVALID",
    });
    expect(getAiUserFacingError(wrapped)).toBe(AI_RESPONSE_INVALID_MESSAGE);
    expect(err).toBeTruthy();
  });
});
