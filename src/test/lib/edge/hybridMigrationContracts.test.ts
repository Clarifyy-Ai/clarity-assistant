import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

/** Edge wrappers that must call executeHybridOperation with a specific MATRIX op. */
const HYBRID_MIGRATIONS: Array<{
  fn: string;
  operation: string | RegExp;
  label?: string;
}> = [
  { fn: "ai-coach-chat", operation: "practice_coach_help" },
  { fn: "generate-answer", operation: "live_answer" },
  { fn: "generate-hint", operation: "practice_coach_help" },
  { fn: "generate-star-answer", operation: "star_builder" },
  { fn: "polish-star-section", operation: "star_builder" },
  { fn: "gap-analysis", operation: "gap_analysis" },
  { fn: "company-research", operation: "company_research" },
  { fn: "generate-questions", operation: "mock_question_generation" },
  { fn: "generate-debrief", operation: "session_debrief" },
  { fn: "generate-scorecard", operation: "session_scorecard" },
  { fn: "analyze-test-performance", operation: "analyze_test" },
  { fn: "parse-document", operation: "document_process" },
  { fn: "process-sprint-transcript", operation: "sprint_review_transcript" },
  {
    fn: "prep-tool",
    operation: /operation:\s*"(prep_rephrase|prep_coding|prep_project|prep_raw_prompt|star_builder|system_design)"/,
    label: "prep hybrid op",
  },
];

describe("hybrid migration source contracts (Edge → executeHybridOperation)", () => {
  it.each(HYBRID_MIGRATIONS)(
    "$fn imports executeHybridOperation and passes $label ?? operation",
    ({ fn, operation, label }) => {
      const source = readFunction(fn);
      expect(source).toContain('from "../_shared/hybridExecute.ts"');
      expect(source).toContain("executeHybridOperation");
      if (typeof operation === "string") {
        expect(source).toMatch(
          new RegExp(`operation:\\s*"${operation}"`),
        );
      } else {
        expect(source).toMatch(operation);
      }
      void label;
    },
  );

  it("prep-tool declares HYBRID_PREP_OPS mapping for rephrase/coding/project", () => {
    const source = readFunction("prep-tool");
    expect(source).toContain("HYBRID_PREP_OPS");
    expect(source).toContain("prep_rephrase");
    expect(source).toContain("prep_coding");
    expect(source).toContain("prep_project");
    expect(source).toContain('operation: "prep_raw_prompt"');
  });

  it("migrated functions do not bypass hybrid with direct AI-only credit deduct", () => {
    for (const { fn } of HYBRID_MIGRATIONS) {
      const source = readFunction(fn);
      // Legacy pattern: standalone deduct without hybrid wrapper (allow hybridExecute import).
      const legacyDeductOnly =
        source.includes("deductCreditsAtomic(") &&
        !source.includes("executeHybridOperation");
      expect(legacyDeductOnly).toBe(false);
    }
  });
});
