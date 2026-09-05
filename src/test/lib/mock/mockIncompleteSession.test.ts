import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mockSessionHasScorecardEvidence } from "@/lib/mock/durableMockTurns";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("mock incomplete session (zero answers)", () => {
  it("MockSession skips generate-scorecard when no scorable answers", () => {
    const src = fs.readFileSync(
      path.join(root, "src/pages/app/mock/MockSession.tsx"),
      "utf8",
    );
    expect(src).toContain("incompleteNoAnswers");
    expect(src).toMatch(/questionsAnswered === 0|incompleteNoAnswers/);
    expect(src).toMatch(/!incompleteNoAnswers.*generate-scorecard|scorecardRequestedRef/s);
  });

  it("mockSessionHasScorecardEvidence returns false for empty/skipped answers", () => {
    expect(mockSessionHasScorecardEvidence([])).toBe(false);
    expect(
      mockSessionHasScorecardEvidence([{ skipped: true, answer_text: "hello" }]),
    ).toBe(false);
    expect(
      mockSessionHasScorecardEvidence([{ answer_text: "   " }]),
    ).toBe(false);
    expect(
      mockSessionHasScorecardEvidence([{ answer_text: "Real answer" }]),
    ).toBe(true);
  });
});
