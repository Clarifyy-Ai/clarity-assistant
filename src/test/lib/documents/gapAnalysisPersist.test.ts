import { describe, expect, it } from "vitest";
import { splitCodingHints } from "@/lib/documents/gapAnalysisPersist";

describe("splitCodingHints", () => {
  it("splits numbered hints into up to 5 cards", () => {
    const text = [
      "1. Think about two pointers.",
      "2. Sort first to make the scan linear.",
      "3. Watch the duplicate window.",
      "4. Return the pair, not the indices.",
      "5. Extra: consider the empty array.",
      "6. Should be dropped.",
    ].join("\n");
    const hints = splitCodingHints(text);
    expect(hints).toHaveLength(5);
    expect(hints[0]).toMatch(/two pointers/i);
    expect(hints[4]).toMatch(/empty array/i);
  });

  it("splits paragraph hints when numbering is absent", () => {
    const hints = splitCodingHints("Start with a hash map.\n\nThen scan once.");
    expect(hints).toEqual(["Start with a hash map.", "Then scan once."]);
  });

  it("returns a single card for an unnumbered blob", () => {
    expect(splitCodingHints("  consider the sliding window  ")).toEqual([
      "consider the sliding window",
    ]);
    expect(splitCodingHints("")).toEqual([]);
  });
});
