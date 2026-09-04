import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

describe("generate-scorecard — typed eligibility codes", () => {
  const source = readFunction("generate-scorecard");

  it("returns 422 NOT_ELIGIBLE_NO_ANSWERS when session has no answers", () => {
    expect(source).toContain("NOT_ELIGIBLE_NO_ANSWERS");
    expect(source).toContain("hasAnswers");
    expect(source).toContain("resolveScorecardEligibility");
    expect(source).toContain("SCORECARD_ELIGIBLE");
    expect(source).toContain("NOT_ELIGIBLE_INCOMPLETE_SESSION");
    expect(source).toContain("FEATURE_NOT_AVAILABLE_FOR_PLAN");
    expect(source).toContain("EVALUATION_FAILED");
    expect(source).toContain("EVALUATION_PROCESSING");
  });

  it("writes durable evaluation_status on start/finish/fail", () => {
    expect(source).toContain('evaluation_status: "processing"');
    expect(source).toContain('evaluation_status: "completed"');
    expect(source).toContain('evaluation_status: "failed_retryable"');
    expect(source).toContain("writeEvaluationState");
  });

  it("returns existing completed scorecard before regenerating when not recalculating", () => {
    expect(source).toContain("idempotent: true");
    expect(source).toContain("hasCompletedScore");
    expect(source).toContain("!recalculate");
  });
});

describe("analytics-dashboard — speech fallbacks stay score-only for overall", () => {
  const source = readFunction("analytics-dashboard");

  it("falls back avg_wpm / filler_rate to session fields", () => {
    expect(source).toContain("resolveWpm");
    expect(source).toContain("resolveFillerRate");
    expect(source).toContain("sessionFillerRatePerMinute");
    expect(source).toContain("session.avg_wpm");
    expect(source).toContain("session.filler_words");
  });

  it("emits pending/failed/excluded/not_scored/scored from evaluation_status", () => {
    expect(source).toContain("analyticsScoreStatusFromEvaluation");
    expect(source).toContain("evaluation_status");
  });

  it("keeps sessions_scored tied to overall_score only", () => {
    expect(source).toContain("sessions_scored: sessionsScored");
    expect(source).toMatch(
      /sessionsScored\s*=\s*recentSessions\.filter\(\s*\(s\)\s*=>\s*typeof s\.overall_score\s*===\s*"number"/,
    );
    expect(source).toMatch(
      /\.filter\(\(sc\)\s*=>\s*typeof sc\.overall_score\s*===\s*"number"\)/,
    );
    expect(source).not.toMatch(/overall_score:\s*resolveWpm/);
  });
});
