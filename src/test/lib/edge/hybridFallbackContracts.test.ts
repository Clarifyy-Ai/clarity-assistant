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
    // Each entry point (execute + stream prepare) reserves once — not inside the fallback loop.
    const deductCalls = hybrid.match(/deductCreditsAtomic\(/g)?.length ?? 0;
    expect(deductCalls).toBe(2);
    expect(hybrid.indexOf("prepareHybridStreamOperation")).toBeGreaterThan(0);
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
    // Overlay coach chat fail-closes: AI only — no STAR scaffold as a fake answer
    expect(router).toContain("practice_coach_help");
    expect(router).toMatch(
      /practice_coach_help:[\s\S]*?preferredOrder:\s*\["ai"\][\s\S]*?pythonFallbackOnAiFailure:\s*false[\s\S]*?canCompleteDeterministically:\s*false/,
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
    expect(statusFn).toMatch(/case "AI_PROVIDER_UNAVAILABLE"/);
    expect(statusFn).toMatch(/return 503/);
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

    // live_answer keeps AI → python → deterministic (hints/answers); coach chat does not
    expect(router).toMatch(
      /live_answer:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true/,
    );
    // star_builder: AI polish first; python/deterministic outlines when provider 503s
    expect(router).toMatch(
      /star_builder:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true/,
    );
    // prep_rephrase: AI preferred with deterministic fallback when AI fails
    expect(router).toMatch(
      /prep_rephrase:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true[\s\S]*?canCompleteDeterministically:\s*true/,
    );
    // system_design: AI preferred for Prep Lab breakdown; python/deterministic fallback only
    expect(router).toMatch(
      /system_design:[\s\S]*?preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\][\s\S]*?pythonFallbackOnAiFailure:\s*true/,
    );
    // gap / scorecard: deterministic → python → ai; session_debrief is AI-only fail-closed
    for (const op of ["gap_analysis", "session_scorecard"] as const) {
      expect(router).toMatch(
        new RegExp(
          `${op}:[\\s\\S]*?preferredOrder:\\s*\\["deterministic",\\s*"python",\\s*"ai"\\][\\s\\S]*?pythonFallbackOnAiFailure:\\s*true`,
        ),
      );
    }
    expect(router).toMatch(
      /session_debrief:[\s\S]*?canCompleteDeterministically:\s*false[\s\S]*?isAiRequired:\s*true[\s\S]*?preferredOrder:\s*\["ai"\][\s\S]*?pythonFallbackOnAiFailure:\s*false/,
    );
    expect(router).toMatch(
      /analyze_test:[\s\S]*?preferredOrder:\s*\["database",\s*"deterministic",\s*"python",\s*"ai"\]/,
    );
    expect(router).toMatch(
      /sprint_review_transcript:[\s\S]*?preferredOrder:\s*\["deterministic",\s*"python",\s*"ai"\]/,
    );
    expect(router).toContain("export function listHybridOperations()");
  });

  it("unknown operations fail closed (UNKNOWN_OPERATION) — no SAFE_DEFAULT", () => {
    expect(router).toContain("UNKNOWN_OPERATION");
    expect(router).toContain("isKnownHybridOperation");
    expect(router).not.toMatch(/Safe default/i);
    expect(hybrid).toContain("isKnownHybridOperation(operation)");
    expect(hybrid).toContain("UNKNOWN_OPERATION");
    const knownIdx = hybrid.indexOf("isKnownHybridOperation(operation)");
    const deductIdx = hybrid.indexOf("deductCreditsAtomic(");
    expect(knownIdx).toBeGreaterThan(0);
    expect(deductIdx).toBeGreaterThan(knownIdx);
  });
});
