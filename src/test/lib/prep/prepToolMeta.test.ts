import { describe, expect, it } from "vitest";
import {
  isInputBasedPrepDraft,
  parsePrepToolMeta,
  prepDraftBadgeLabel,
} from "@/lib/prep/prepToolMeta";

describe("parsePrepToolMeta", () => {
  it("aliases edge draft_kind polished to ai_polished", () => {
    expect(parsePrepToolMeta({ draft_kind: "polished", source: "ai" })).toEqual({
      draft_kind: "ai_polished",
      source: "ai",
    });
  });

  it("accepts ai_polished and input_based", () => {
    expect(parsePrepToolMeta({ draft_kind: "ai_polished" }).draft_kind).toBe("ai_polished");
    expect(parsePrepToolMeta({ draft_kind: "input_based" }).draft_kind).toBe("input_based");
  });

  it("reads draft_kind/source from nested meta", () => {
    expect(
      parsePrepToolMeta({
        result: "…",
        meta: { draft_kind: "input_based", source: "deterministic" },
      }),
    ).toEqual({
      draft_kind: "input_based",
      source: "deterministic",
    });
  });

  it("ignores unknown draft_kind/source", () => {
    expect(parsePrepToolMeta({ draft_kind: "mystery", source: "cache" })).toEqual({
      draft_kind: undefined,
      source: undefined,
    });
  });
});

describe("prepDraftBadgeLabel", () => {
  it("maps deterministic|python source to Input-based draft", () => {
    expect(prepDraftBadgeLabel({ source: "deterministic" })).toBe("Input-based draft");
    expect(prepDraftBadgeLabel({ source: "python" })).toBe("Input-based draft");
  });

  it("maps draft_kind input_based to Input-based draft", () => {
    expect(prepDraftBadgeLabel({ draft_kind: "input_based" })).toBe("Input-based draft");
  });

  it("maps polished/ai_polished to AI polished", () => {
    expect(prepDraftBadgeLabel(parsePrepToolMeta({ draft_kind: "polished" }))).toBe(
      "AI polished",
    );
    expect(prepDraftBadgeLabel({ draft_kind: "ai_polished" })).toBe("AI polished");
  });

  it("returns null when meta is empty", () => {
    expect(prepDraftBadgeLabel({})).toBeNull();
  });
});

describe("isInputBasedPrepDraft", () => {
  it("is true for deterministic/python/input_based", () => {
    expect(isInputBasedPrepDraft({ source: "deterministic" })).toBe(true);
    expect(isInputBasedPrepDraft({ source: "python" })).toBe(true);
    expect(isInputBasedPrepDraft({ draft_kind: "input_based" })).toBe(true);
  });

  it("is false for AI polished", () => {
    expect(isInputBasedPrepDraft({ draft_kind: "ai_polished", source: "ai" })).toBe(false);
  });
});
