import { describe, expect, it } from "vitest";
import {
  finiteOrNull,
  formatMarksOrUnavailable,
  formatMatchScore,
  formatNullableNumber,
  formatPercentOrUnavailable,
  RESULT_UNAVAILABLE,
  unscoredReasonLabel,
} from "@/lib/results/resultDisplay";
import { resolveOverallScore } from "@/lib/session/sessionDisplay";
import { MOCK_TEST_SCORE_ALGORITHM_VERSION } from "@/lib/gov-exam/mockTestScoring";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("resultDisplay honesty", () => {
  it("missing evidence → Not available, never believable 0", () => {
    expect(formatNullableNumber(undefined, { hasEvidence: false })).toBe(RESULT_UNAVAILABLE);
    expect(formatNullableNumber(null)).toBe(RESULT_UNAVAILABLE);
    expect(formatPercentOrUnavailable(null)).toBe(RESULT_UNAVAILABLE);
    expect(formatMarksOrUnavailable(null, 100)).toBe(RESULT_UNAVAILABLE);
    expect(formatMatchScore(undefined)).toBe(RESULT_UNAVAILABLE);
    expect(formatMatchScore("")).toBe(RESULT_UNAVAILABLE);
  });

  it("genuine zero still shows 0 when evidence exists", () => {
    expect(formatNullableNumber(0, { hasEvidence: true })).toBe("0");
    expect(formatPercentOrUnavailable(0, true)).toBe("0%");
    expect(formatMarksOrUnavailable(0, 100, true)).toBe("0/100");
    expect(formatMatchScore(0)).toBe("0%");
  });

  it("finiteOrNull rejects non-finite", () => {
    expect(finiteOrNull(undefined)).toBeNull();
    expect(finiteOrNull("x")).toBeNull();
    expect(finiteOrNull(42)).toBe(42);
  });

  it("unscoredReasonLabel surfaces status/eligibility", () => {
    expect(
      unscoredReasonLabel({ evaluationStatus: "processing" }),
    ).toMatch(/processing/i);
    expect(
      unscoredReasonLabel({ eligibilityReason: "NOT_ELIGIBLE_NO_ANSWERS" }),
    ).toMatch(/no answers were recorded/i);
    expect(
      unscoredReasonLabel({ eligibilityReason: "NOT_ELIGIBLE_NO_ANSWERS" }),
    ).not.toBe("NOT_ELIGIBLE_NO_ANSWERS");
  });
});

describe("resolveOverallScore authority", () => {
  it("only returns completed scorecard scores", () => {
    expect(
      resolveOverallScore(
        { overall_score: 90 },
        { overall_score: 72, evaluation_status: "completed" },
      ),
    ).toBe(72);
    expect(
      resolveOverallScore(
        { overall_score: 90 },
        { overall_score: 72, evaluation_status: "processing" },
      ),
    ).toBeNull();
    expect(
      resolveOverallScore(
        { overall_score: 90 },
        { overall_score: null, evaluation_status: "not_eligible" },
      ),
    ).toBeNull();
  });
});

describe("cross-page reconciliation contracts", () => {
  it("submit-test writes mock_test_score_v2 consistently", () => {
    expect(MOCK_TEST_SCORE_ALGORITHM_VERSION).toBe("mock_test_score_v2");
    const submit = fs.readFileSync(
      path.join(root, "supabase/functions/submit-test/index.ts"),
      "utf8",
    );
    expect(submit).toContain("MOCK_TEST_SCORE_ALGORITHM_VERSION");
    expect(submit).not.toMatch(/p_algorithm_version:\s*"mock_test_score_v1"/);
  });

  it("history migration gates interview scores on evaluation_status", () => {
    const migration = fs.readFileSync(
      path.join(root, "supabase/migrations/20260904160000_results_provenance_hardening.sql"),
      "utf8",
    );
    expect(migration).toContain("evaluation_status = 'completed'");
    expect(migration).toContain("evaluation_input_snapshot");
    expect(migration).toContain("judge_version");
    expect(migration).toContain("case_set_checksum");
  });

  it("product UI paths avoid invent mid-band confidence defaults", () => {
    const confidence = fs.readFileSync(
      path.join(root, "src/hooks/useConfidenceScore.ts"),
      "utf8",
    );
    const help = fs.readFileSync(
      path.join(root, "src/lib/session/aiHelpConfirm.ts"),
      "utf8",
    );
    const dashboard = fs.readFileSync(
      path.join(root, "src/pages/app/Dashboard.tsx"),
      "utf8",
    );
    expect(confidence).toContain("useState<number | null>(null)");
    expect(confidence).not.toMatch(/useState\(50\)/);
    expect(help).not.toMatch(/score\s*=\s*0\.75/);
    expect(dashboard).toContain("Activity readiness");
    expect(dashboard).toContain("activity readiness");
    expect(dashboard).not.toContain("interview readiness");
  });
});
