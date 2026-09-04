import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessLiveCoachFactualIntegrity,
  assertLiveCoachOutputGrounded,
} from "../../../../supabase/functions/_shared/factualIntegrity";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readFn(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions", name, "index.ts"), "utf8");
}

describe("live coach factual integrity gate", () => {
  it("fails invented metrics against resume evidence", () => {
    const source =
      "Worked at Contoso as a backend engineer. Improved API latency and shipped billing features.";
    const bad =
      "At Contoso I reduced latency by 87% and grew revenue to $12M while leading a team of 40.";
    const check = assessLiveCoachFactualIntegrity(source, bad);
    expect(check.ok).toBe(false);
    expect(check.inventedNumbers.length).toBeGreaterThan(0);
  });

  it("allows thin-evidence scaffolds without invented numbers", () => {
    const check = assessLiveCoachFactualIntegrity(
      "",
      "• Structure a STAR answer\n• Ask for a measurable result if available\n• Keep claims grounded",
    );
    expect(check.ok).toBe(true);
  });

  it("assertLiveCoachOutputGrounded throws on invalid output", () => {
    expect(() =>
      assertLiveCoachOutputGrounded(
        "Built payment APIs at Contoso.",
        "I grew ARR by 250% at Globex while managing 90 engineers.",
      ),
    ).toThrow(/invalid output/i);
  });

  it("generate-hint and generate-answer wire post-generation factual gates", () => {
    const hint = readFn("generate-hint");
    const answer = readFn("generate-answer");
    for (const src of [hint, answer]) {
      expect(src).toContain("assertLiveCoachOutputGrounded");
      expect(src).toContain("AI_INVALID_OUTPUT");
      expect(src).toContain("FACTUAL_INTEGRITY_SYSTEM_RULE");
    }
  });
});
