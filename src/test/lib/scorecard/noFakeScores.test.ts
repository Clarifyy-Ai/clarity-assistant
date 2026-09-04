import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapRowToScorecard } from "@/types/scorecard.types";
import { formatSessionScore } from "@/lib/analytics/scoreStatus";
import { resolveScorecardEligibility } from "@/lib/scorecard/eligibility";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("no-fake-score mapper", () => {
  it("does not coerce missing speech metrics to zero", () => {
    const card = mapRowToScorecard({
      id: "sc1",
      user_id: "u1",
      session_id: "s1",
      overall_score: 72,
      communication: 70,
      technical: 71,
      problem_solving: 73,
      confidence: 74,
      feedback: null,
      strengths: null,
      improvements: null,
      created_at: new Date().toISOString(),
      details: {},
    });
    expect(card.filler_count).toBeNull();
    expect(card.filler_rate).toBeNull();
    expect(card.wpm_avg).toBeNull();
    expect(card.star_adherence).toBeNull();
    expect(card.wpm_trend).toBeNull();
  });
});

describe("formatSessionScore no fake zero", () => {
  it("never shows 0 for failed or ineligible", () => {
    expect(formatSessionScore(0, "failed")).not.toBe("0");
    expect(formatSessionScore(null, "failed")).not.toBe("0");
    expect(formatSessionScore(0, "not_scored")).not.toBe("0");
    expect(formatSessionScore(0, "excluded")).not.toBe("0");
    expect(formatSessionScore(0, "scored")).toBe("0");
  });
});

describe("scorecard eligibility codes", () => {
  it("returns typed codes for common cases", () => {
    expect(
      resolveScorecardEligibility({
        sessionCompleted: true,
        scorableAnswerCount: 0,
      }).code,
    ).toBe("NOT_ELIGIBLE_NO_ANSWERS");
    expect(
      resolveScorecardEligibility({
        sessionCompleted: false,
        scorableAnswerCount: 1,
      }).code,
    ).toBe("NOT_ELIGIBLE_INCOMPLETE_SESSION");
    expect(
      resolveScorecardEligibility({
        sessionCompleted: true,
        scorableAnswerCount: 2,
      }).code,
    ).toBe("SCORECARD_ELIGIBLE");
  });
});

describe("no-fake-score contracts", () => {
  it("Scorecard UI and mapper avoid speech metric ?? 0", () => {
    const types = fs.readFileSync(path.join(root, "src/types/scorecard.types.ts"), "utf8");
    const page = fs.readFileSync(path.join(root, "src/pages/Scorecard.tsx"), "utf8");
    const analytics = fs.readFileSync(path.join(root, "src/pages/app/Analytics.tsx"), "utf8");
    expect(types).not.toMatch(/filler_count:\s*details\.filler_count\s*\?\?\s*0/);
    expect(types).not.toMatch(/wpm_avg:\s*details\.wpm_avg\s*\?\?\s*0/);
    expect(types).not.toMatch(/star_adherence:\s*details\.star_adherence\s*\?\?\s*0/);
    expect(page).toContain("Not available");
    expect(analytics).toContain("Not available");
  });

  it("generate-scorecard and migration persist evaluation_status", () => {
    const edge = fs.readFileSync(
      path.join(root, "supabase/functions/generate-scorecard/index.ts"),
      "utf8",
    );
    const migration = fs.readFileSync(
      path.join(root, "supabase/migrations/20260904121000_scorecards_evaluation_status.sql"),
      "utf8",
    );
    expect(edge).toMatch(/NOT_ELIGIBLE_NO_ANSWERS|evaluation_status/);
    expect(migration).toContain("evaluation_status");
    expect(migration).toContain("eligibility_reason");
  });
});
