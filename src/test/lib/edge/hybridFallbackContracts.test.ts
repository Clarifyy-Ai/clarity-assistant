import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readShared(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions/_shared", name), "utf8");
}

describe("hybridExecute / operationRouter source contracts", () => {
  const hybrid = readShared("hybridExecute.ts");
  const router = readShared("operationRouter.ts");
  const domain = readShared("domainErrors.ts");

  it("documents chaos flags and wires AI unavailable into canUseAI", () => {
    expect(router).toContain("HYBRID_FORCE_AI_UNAVAILABLE");
    expect(router).toContain("HYBRID_FORCE_PYTHON_UNAVAILABLE");
    expect(hybrid).toContain("HYBRID_FORCE_AI_UNAVAILABLE");
    expect(router).toContain("isAiForceUnavailable");
    expect(router).toMatch(/canUseAI\s*=\s*!aiBlocked/);
  });

  it("reserves credits once before the source walk (no re-deduct on fallback)", () => {
    const reserveIdx = hybrid.indexOf("// --- Credit reserve (once) ---");
    const deductIdx = hybrid.indexOf("deductCreditsAtomic(");
    const loopIdx = hybrid.indexOf("while (queue.length > 0");
    expect(reserveIdx).toBeGreaterThan(0);
    expect(deductIdx).toBeGreaterThan(reserveIdx);
    expect(loopIdx).toBeGreaterThan(deductIdx);
    // Only one deductCreditsAtomic call site in the executor body.
    expect(hybrid.match(/deductCreditsAtomic\(/g)?.length).toBe(1);
    expect(hybrid).toContain("enqueueFallbacks");
    expect(hybrid.toLowerCase()).toContain("no re-deduct");
  });

  it("refunds reserved credits on total failure and exception paths", () => {
    expect(hybrid).toContain("// Total failure");
    expect(hybrid).toContain("creditsReserved && !creditFinalized");
    expect(hybrid.match(/refundCredits\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(hybrid).toContain("hybrid_failure:");
    expect(hybrid).toContain("hybrid_exception:");
  });

  it("AI failure enqueues python/deterministic when pythonFallbackOnAiFailure", () => {
    expect(hybrid).toContain('failed === "ai" && route.pythonFallbackOnAiFailure');
    expect(hybrid).toContain('push("python")');
    expect(hybrid).toContain('push("deterministic")');
    // practice_coach_help prefers AI then python with fallback enabled
    expect(router).toContain("practice_coach_help");
    expect(router).toMatch(
      /practice_coach_help:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true/,
    );
  });

  it("validation failure continues fallback walk and never fakes success", () => {
    expect(hybrid).toContain("validate_failed:");
    expect(hybrid).toContain("enqueueFallbacks(outcome.routeSource");
    // Success return requires validated data path; comment contract
    expect(hybrid).toContain("Never fake success");
    // Empty AI output is a failure, not success
    expect(hybrid).toContain("AI_INVALID_OUTPUT");
    expect(hybrid).toContain("AI returned empty output");
  });

  it("maps AI_PROVIDER_UNAVAILABLE to 503 (not 502)", () => {
    const statusFn = domain.slice(domain.indexOf("httpStatusForDomainCode"));
    expect(statusFn).toMatch(/AI_PROVIDER_UNAVAILABLE[\s\S]{0,160}return 503/);
    expect(statusFn).not.toMatch(/AI_PROVIDER_UNAVAILABLE[\s\S]{0,80}return 502/);
  });

  it("MATRIX includes Complete Application Hybrid ops with expected routes", () => {
    const newOps = [
      "live_answer",
      "gap_analysis",
      "session_debrief",
      "session_scorecard",
      "analyze_test",
      "prep_rephrase",
      "prep_coding",
      "prep_project",
      "sprint_review_transcript",
    ] as const;

    for (const op of newOps) {
      expect(router).toContain(`${op}:`);
      // Each MATRIX key appears in HybridOperation union and MATRIX record.
      expect(router).toMatch(new RegExp(`\\|\\s*"${op}"`));
    }

    // live_answer mirrors practice_coach_help: AI → python → deterministic
    expect(router).toMatch(
      /live_answer:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true/,
    );
    // star_builder: python structure first, AI polish second
    expect(router).toMatch(
      /star_builder:[\s\S]*?preferredOrder:\s*\["python",\s*"ai",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true/,
    );
    // prep_rephrase: AI preferred with deterministic fallback when AI fails
    expect(router).toMatch(
      /prep_rephrase:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true[\s\S]*?canCompleteDeterministically:\s*true/,
    );
    // system_design: AI preferred for Prep Lab breakdown; python/deterministic fallback only
    expect(router).toMatch(
      /system_design:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true/,
    );
    // gap / debrief / scorecard: deterministic → python → ai
    for (const op of ["gap_analysis", "session_debrief", "session_scorecard"] as const) {
      expect(router).toMatch(
        new RegExp(
          `${op}:[\\s\\S]*?preferredOrder:\\s*\\["deterministic",\\s*"python",\\s*"ai"\\][\\s\\S]*?pythonFallbackOnAiFailure:\\s*true`,
        ),
      );
    }
    expect(router).toMatch(
      /analyze_test:[\s\S]*?preferredOrder:\s*\["database",\s*"deterministic",\s*"python",\s*"ai"\]/,
    );
    expect(router).toMatch(
      /sprint_review_transcript:[\s\S]*?preferredOrder:\s*\["deterministic",\s*"python",\s*"ai"\]/,
    );
    expect(router).toContain("export function listHybridOperations()");
  });
});
