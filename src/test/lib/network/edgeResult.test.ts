import { describe, expect, it } from "vitest";
import { parsePrepToolResponse } from "@/lib/network/edgeResult";

describe("parsePrepToolResponse", () => {
  it("reads flat result after fetchEdgeJson unwrap", () => {
    expect(parsePrepToolResponse({ result: "Hello world", source: "ai" })).toEqual({
      result: "Hello world",
      source: "ai",
      alternatives: undefined,
      cached: false,
    });
  });

  it("reads nested data.result (hybrid / partial unwrap)", () => {
    expect(
      parsePrepToolResponse({
        success: true,
        source: "ai",
        data: { result: "Nested STAR draft", source: "ai" },
      }),
    ).toEqual({
      result: "Nested STAR draft",
      source: "ai",
      alternatives: undefined,
      cached: false,
    });
  });

  it("reads double-nested data.data.result", () => {
    expect(
      parsePrepToolResponse({
        data: { data: { result: "Deep result", source: "deterministic" } },
      }),
    ).toEqual({
      result: "Deep result",
      source: "deterministic",
      alternatives: undefined,
      cached: false,
    });
  });

  it("returns empty result for malformed payloads", () => {
    expect(parsePrepToolResponse({ success: true })).toEqual({
      result: "",
      source: undefined,
      alternatives: undefined,
      cached: false,
    });
  });

  it("parses plain string payloads", () => {
    expect(parsePrepToolResponse("  Trimmed draft  ")).toMatchObject({
      result: "Trimmed draft",
    });
  });

  it("returns empty result for null and non-object values", () => {
    expect(parsePrepToolResponse(null)).toMatchObject({ result: "" });
    expect(parsePrepToolResponse(42)).toMatchObject({ result: "" });
  });

  it("falls back to hints when result is missing", () => {
    expect(
      parsePrepToolResponse({
        success: true,
        data: { hints: "Try structuring with STAR.", source: "deterministic" },
      }),
    ).toEqual({
      result: "Try structuring with STAR.",
      source: "deterministic",
      alternatives: undefined,
      cached: false,
    });
  });

  it("reads hint singular and propagates cached and alternatives", () => {
    expect(
      parsePrepToolResponse({
        result: "Primary",
        hint: "ignored when result present",
        cached: true,
        alternatives: ["alt-a"],
      }),
    ).toEqual({
      result: "Primary",
      source: undefined,
      alternatives: ["alt-a"],
      cached: true,
    });
    expect(
      parsePrepToolResponse({
        data: { hint: "Outline only", cached: true, alternatives: ["b"] },
      }),
    ).toEqual({
      result: "Outline only",
      source: undefined,
      alternatives: ["b"],
      cached: true,
    });
  });
});
