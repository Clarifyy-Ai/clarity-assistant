import { describe, expect, it } from "vitest";
import { paletteGroupOrder } from "@/lib/search/commandPaletteStorage";

describe("command palette ranking", () => {
  it("ranks Prep above later sections when the query includes prep", () => {
    expect(paletteGroupOrder("prep")).toEqual([
      "Prep",
      "Navigate",
      "Sessions",
      "Account",
    ]);
  });

  it("keeps default Navigate-first order otherwise", () => {
    expect(paletteGroupOrder("dashboard")).toEqual([
      "Navigate",
      "Sessions",
      "Prep",
      "Account",
    ]);
  });
});
