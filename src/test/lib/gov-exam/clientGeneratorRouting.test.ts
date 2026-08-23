import { describe, expect, it } from "vitest";

import { pickPaperGeneratorPreference } from "@/lib/gov-exam/generatorRouting";

describe("pickPaperGeneratorPreference", () => {
  it("uses edge for bank-only custom sets", () => {
    expect(
      pickPaperGeneratorPreference({
        mode: "custom_mock",
        questionCount: 20,
        available: 50,
        basis: "custom",
      }),
    ).toBe("edge");
  });

  it("uses auto for full simulations", () => {
    expect(
      pickPaperGeneratorPreference({
        mode: "generated_mock",
        questionCount: 100,
        available: 10,
        basis: "full_sim",
      }),
    ).toBe("auto");
  });
});
