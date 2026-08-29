import { describe, expect, it } from "vitest";

import {
  parseGeneratorPreference,
  resolvePaperGenerator,
} from "../../../../supabase/functions/_shared/govGeneratorRouting.ts";

describe("parseGeneratorPreference", () => {
  it("reads generator and legacy preferPython flags", () => {
    expect(parseGeneratorPreference({ generator: "python" })).toBe("python");
    expect(parseGeneratorPreference({ generator: "edge" })).toBe("edge");
    expect(parseGeneratorPreference({ preferPython: true })).toBe("python");
    expect(parseGeneratorPreference({ preferEdge: true })).toBe("edge");
    expect(parseGeneratorPreference({})).toBe("auto");
  });
});

describe("resolvePaperGenerator", () => {
  it("keeps bank-only on Edge", () => {
    expect(
      resolvePaperGenerator({
        kind: "bank_only",
        requested: 20,
        aiContribution: 0,
        skipAiFill: true,
        preference: "python",
        pythonWorkerEnabled: true,
      }),
    ).toBe("edge_assembler");
  });
});