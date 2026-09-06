import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countScorableAnswers, isNonScorableAnswer } from "@/lib/scorecard/scorableAnswers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("scorecard scorable answer quality floor", () => {
  const edgeEligibility = fs.readFileSync(
    path.join(root, "supabase/functions/_shared/scorecardEligibility.ts"),
    "utf8",
  );

  it("client and Edge share junk-answer detection contract", () => {
    expect(edgeEligibility).toContain("isNonScorableAnswer");
    expect(edgeEligibility).toContain("countScorableAnswers");
    expect(isNonScorableAnswer("idk")).toBe(true);
    expect(isNonScorableAnswer("(skipped)")).toBe(true);
    expect(isNonScorableAnswer("I led a migration that cut latency by 40%.")).toBe(false);
  });

  it("countScorableAnswers excludes junk but keeps substantive answers", () => {
    expect(
      countScorableAnswers([
        { answer: "idk" },
        { answer: "We redesigned the API with caching and cut p95 by 35%." },
        { answer: "" },
      ]),
    ).toBe(1);
  });
});

describe("generate-scorecard charge gate contracts", () => {
  const source = fs.readFileSync(
    path.join(root, "supabase/functions/generate-scorecard/index.ts"),
    "utf8",
  );

  it("checks scorable answers before hybrid charge", () => {
    expect(source).toContain("isNonResponsiveAnswer");
    expect(source).toContain("scorableAnswerCount");
    expect(source).toContain("assertBeforeCharge");
    expect(source).toContain("assertBeforeCharge");
    const handlerStart = source.indexOf("Deno.serve");
    const handler = source.slice(handlerStart);
    const eligibilityIdx = handler.indexOf("resolveScorecardEligibility");
    const hybridIdx = handler.indexOf("executeHybridOperation");
    expect(eligibilityIdx).toBeGreaterThan(0);
    expect(hybridIdx).toBeGreaterThan(eligibilityIdx);
  });
});
