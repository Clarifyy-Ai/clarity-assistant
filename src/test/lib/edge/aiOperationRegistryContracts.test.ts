import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  httpStatusForDomainCode,
  isRetryable,
} from "../../../../supabase/functions/_shared/domainErrors";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readShared(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions/_shared", name), "utf8");
}

const CATALOG_KEYS = [
  "live_hint",
  "live_answer",
  "live_feedback",
  "screenshot_answer",
  "session_debrief",
  "generate_scorecard",
  "ai_coach_message",
  "generate_questions",
  "star_builder",
  "rephraser",
  "company_research",
  "coding_hint",
  "system_design",
  "mock_session",
  "resume_analysis",
  "gap_analysis",
  "parse_document",
  "create_mock_test",
  "mock_test_ai_gap_fill",
  "generate_practice_questions",
  "parse_question_pdf",
  "analyze_test_performance",
  "project_builder",
  "polish_star",
] as const;

describe("AI operation registry / UNKNOWN_OPERATION fail-closed contracts", () => {
  const router = readShared("operationRouter.ts");
  const hybrid = readShared("hybridExecute.ts");
  const registry = readShared("aiOperationRegistry.ts");
  const domain = readShared("domainErrors.ts");
  const economics = readShared("creditEconomics.ts");
  const policy = readShared("aiFeaturePolicy.ts");

  it("domainErrors defines typed UNKNOWN_OPERATION as non-retryable 400", () => {
    expect(domain).toContain('"UNKNOWN_OPERATION"');
    expect(httpStatusForDomainCode("UNKNOWN_OPERATION")).toBe(400);
    expect(isRetryable("UNKNOWN_OPERATION")).toBe(false);
    expect(domain).toMatch(/case "UNKNOWN_OPERATION":\s*return 400/);
  });

  it("decideRoute rejects unknown ops — no SAFE_DEFAULT fall-open", () => {
    expect(router).toContain("UNKNOWN_OPERATION");
    expect(router).toContain("isKnownHybridOperation");
    expect(router).toContain("throw new DomainError");
    expect(router).not.toMatch(/Safe default/i);
    expect(router).not.toMatch(
      /preferredOrder:\s*\["deterministic",\s*"database",\s*"python",\s*"ai"\]/,
    );
  });

  it("hybridExecute refuses unknown ops before credit reserve", () => {
    expect(hybrid).toContain("isKnownHybridOperation");
    expect(hybrid).toContain("UNKNOWN_OPERATION");
    expect(hybrid).toContain("unknownOperationResult");

    const execIdx = hybrid.indexOf("export async function executeHybridOperation");
    const prepareIdx = hybrid.indexOf("export async function prepareHybridStreamOperation");
    expect(execIdx).toBeGreaterThan(0);
    expect(prepareIdx).toBeGreaterThan(execIdx);

    for (const [sliceStart, sliceEnd] of [
      [execIdx, prepareIdx],
      [prepareIdx, hybrid.length],
    ] as const) {
      const slice = hybrid.slice(sliceStart, sliceEnd);
      const knownCheck = slice.indexOf("isKnownHybridOperation(operation)");
      const creditReserve = slice.indexOf("deductCreditsAtomic(");
      expect(knownCheck).toBeGreaterThan(0);
      expect(creditReserve).toBeGreaterThan(knownCheck);
      expect(slice).toContain("Refuse unknown ops before");
    }
  });

  it("aiOperationRegistry covers every HybridOperation with catalog-aligned credit keys", () => {
    expect(registry).toContain("AI_OPERATION_REGISTRY");
    expect(registry).toContain("operationId");
    expect(registry).toContain("edgeFunction");
    expect(registry).toContain("creditCostKey");
    expect(registry).toContain("promptId");
    expect(registry).toContain("promptVersion");
    expect(registry).toContain("requiredContextKeys");
    expect(registry).toContain("isAiRequired");

    const ops = [
      "gov_exam_assemble",
      "resume_parse",
      "document_process",
      "star_builder",
      "system_design",
      "practice_coach_help",
      "live_answer",
      "company_research",
      "mock_question_generation",
      "sprint_review_transcript",
      "gap_analysis",
      "session_debrief",
      "session_scorecard",
      "analyze_test",
      "prep_rephrase",
      "prep_coding",
      "prep_project",
      "prep_raw_prompt",
    ] as const;

    for (const op of ops) {
      expect(registry).toContain(`${op}:`);
      expect(router).toMatch(new RegExp(`\\|\\s*"${op}"`));
    }

    // Drift fixes called out in audit — must use catalog keys, not aliases.
    expect(router).toContain('creditCostKey: "ai_coach_message"');
    expect(router).toContain('creditCostKey: "create_mock_test"');
    expect(router).toContain('creditCostKey: "star_builder"');
    expect(router).toContain('creditCostKey: "resume_analysis"');
    expect(router).not.toContain('creditCostKey: "ai_coach_chat"');
    expect(router).not.toContain('creditCostKey: "create_exam_paper"');
    expect(router).not.toContain('creditCostKey: "generate_star_answer"');
    expect(router).not.toContain('creditCostKey: "sprint_review"');
    expect(router).not.toContain('creditCostKey: "parse_resume"');

    // Every MATRIX creditCostKey must exist in the Edge catalog object.
    const keyMatches = [...router.matchAll(/creditCostKey:\s*"([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect(keyMatches.length).toBeGreaterThan(10);
    for (const key of keyMatches) {
      expect(CATALOG_KEYS).toContain(key as (typeof CATALOG_KEYS)[number]);
      expect(economics).toContain(`${key}:`);
    }

    expect(registry).toContain('edgeFunction: "ai-coach-chat"');
    expect(registry).toContain('creditCostKey: "ai_coach_message"');
  });

  it("aiFeaturePolicy registers ai_coach_chat with prompt version metadata", () => {
    expect(policy).toMatch(
      /ai_coach_chat:\s*\{[\s\S]*?promptId:\s*"practice_coach_chat"[\s\S]*?promptVersion:\s*"v1"/,
    );
  });
});
