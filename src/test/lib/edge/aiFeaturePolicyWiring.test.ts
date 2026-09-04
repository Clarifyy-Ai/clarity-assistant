import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

function readShared(name: string): string {
  return fs.readFileSync(path.join(functionsDir, "_shared", name), "utf8");
}

const WIRED_FUNCTIONS = [
  "generate-hint",
  "generate-star-answer",
  "generate-scorecard",
  "generate-debrief",
  "gap-analysis",
  "prep-tool",
  "generate-questions",
  "company-research",
  "polish-star-section",
  "process-sprint-transcript",
] as const;

describe("AI feature policy wiring", () => {
  it("defines named policies plus getAiFeaturePolicy safe default", () => {
    const src = readShared("aiFeaturePolicy.ts");
    expect(src).toContain("export function getAiFeaturePolicy");
    expect(src).toContain("maxOutputTokens: 1024");
    expect(src).toContain("skipSecondaryOnQuota: true");
    for (const feature of [
      "generate_star_answer",
      "generate_hint",
      "analyze_test",
      "gov_ai_gap_fill",
      "generate_debrief",
      "generate_questions",
      "generate_scorecard",
      "polish_star_section",
      "company_research",
      "prep_tool",
      "process_sprint_transcript",
      "gap_analysis",
      "generate_answer",
      "extract_question_paper",
      "parse_question_pdf",
      "ai_coach_chat",
    ]) {
      expect(src).toContain(`${feature}:`);
    }
  });

  it.each(WIRED_FUNCTIONS)(
    "%s imports or references aiFeaturePolicy / skipSecondaryOnQuota / getAiFeaturePolicy",
    (name) => {
      const source = readFunction(name);
      expect(source).toMatch(/aiFeaturePolicy/);
      expect(source).toContain("getAiFeaturePolicy");
      expect(source).toContain("skipSecondaryOnQuota");
    },
  );

  it("generate-scorecard returns persisted scorecard before AI", () => {
    const source = readFunction("generate-scorecard");
    const existingIdx = source.indexOf("hasCompletedScore");
    const aiIdx = source.indexOf("runAi:");
    expect(existingIdx).toBeGreaterThan(0);
    expect(aiIdx).toBeGreaterThan(existingIdx);
    expect(source).toContain("!recalculate");
    expect(source).toContain('operation: "session_scorecard"');
  });
});
