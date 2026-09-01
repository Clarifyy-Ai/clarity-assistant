import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  enqueueFallbacks,
  simulateHybridExecution,
  type HybridRouteSource,
  type RouteFallbackFlags,
} from "./hybridEnqueueFallbacks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

/** Mirrors MATRIX session_debrief / session_scorecard. */
const sessionHybridRoute: RouteFallbackFlags = {
  preferredOrder: ["deterministic", "python", "ai"],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: true,
  canUseAI: true,
  canUsePython: true,
};

/** Mirrors MATRIX analyze_test. */
const analyzeTestRoute: RouteFallbackFlags = {
  preferredOrder: ["database", "deterministic", "python", "ai"],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: true,
  canUseAI: true,
  canUsePython: true,
};

describe("sessions-ai Wave 1 edge contracts", () => {
  it("generate-debrief uses hybrid session_debrief without fake DEFAULT_DEBRIEF parse fallback", () => {
    const source = readFunction("generate-debrief");
    expect(source).toContain('operation: "session_debrief"');
    expect(source).toContain("runDeterministic:");
    expect(source).toContain("runPython:");
    expect(source).toContain("runAi:");
    expect(source).toContain("parseDebriefFromAi");
    expect(source).not.toContain("DEFAULT_DEBRIEF");
    expect(source).not.toMatch(/parseJSON<DebriefPayload>\([^,]+,\s*DEFAULT_DEBRIEF/);
    expect(source).toContain("AI_INVALID_OUTPUT");
    expect(source).toContain("Credits refunded");
    expect(source).toContain("validate:");
  });

  it("generate-scorecard uses hybrid session_scorecard and throws on invalid AI JSON", () => {
    const source = readFunction("generate-scorecard");
    expect(source).toContain('operation: "session_scorecard"');
    expect(source).toContain("runDatabase:");
    expect(source).toContain("runDeterministic:");
    expect(source).toContain("runPython:");
    expect(source).toContain("runAi:");
    expect(source).toContain("existing && !recalculate");
    expect(source).toContain("getAiFeaturePolicy(\"generate_scorecard\")");
    expect(source).toContain("skipSecondaryOnQuota: true");
    expect(source).not.toContain("using deterministic rubric");
    expect(source).toContain("Scorecard AI returned invalid JSON");
    expect(source).toContain("Credits refunded");
    expect(source.indexOf("existing && !recalculate")).toBeLessThan(
      source.indexOf("await generateWithFallback"),
    );
  });

  it("analyze-test-performance honors database → deterministic → python → ai", () => {
    const source = readFunction("analyze-test-performance");
    expect(source).toContain('operation: "analyze_test"');
    expect(source).toContain("runDatabase:");
    expect(source).toContain("runDeterministic:");
    expect(source).toContain("runPython:");
    expect(source).toContain("runAi:");
    expect(source).toContain("cachedAnalysis");
    expect(source).toContain("getAiFeaturePolicy(\"analyze_test\")");
    expect(source).toContain("Credits refunded");
    expect(source).not.toContain("DEFAULT_");
    expect(source.indexOf("if (cachedAnalysis)")).toBeLessThan(
      source.indexOf("generateWithFallback("),
    );
    expect(source).not.toMatch(/if \(!aiResult\) aiResult = await runAI\(\)/);
  });

  it("compare-sessions is DB-only with no silent AI/hybrid dependency", () => {
    const source = readFunction("compare-sessions");
    expect(source).toContain("buildComparisonPayload");
    expect(source).not.toContain("executeHybridOperation");
    expect(source).not.toContain("generateWithFallback");
    expect(source).not.toContain("callAI");
    expect(source).not.toContain("pythonExecuteOperation");
  });

  it("finalize-session is lifecycle RPC only with no AI path", () => {
    const source = readFunction("finalize-session");
    expect(source).toContain("finalize_owned_session");
    expect(source).not.toContain("executeHybridOperation");
    expect(source).not.toContain("generateWithFallback");
    expect(source).not.toContain("callAI");
    expect(source).not.toContain("pythonExecuteOperation");
  });
});

describe("sessions-ai hybrid fallback simulation", () => {
  it("session_debrief: invalid AI JSON enqueues python, deterministic, database", () => {
    const remaining: HybridRouteSource[] = [];
    const queued = new Set<HybridRouteSource>(["ai"]);
    enqueueFallbacks("ai", sessionHybridRoute, remaining, queued);
    expect(remaining).toEqual(["python", "deterministic", "database"]);
  });

  it("session_debrief: AI validation fail → deterministic succeeds, single deduct", async () => {
    const result = await simulateHybridExecution({
      route: { ...sessionHybridRoute, preferredOrder: ["ai"] },
      creditCost: 15,
      runners: {
        ai: async () => ({ debrief: { summary: "" } }),
        deterministic: async () => ({ debrief: { summary: "Metrics-based debrief" } }),
      },
      validate: async (data, source) => {
        const summary = String(
          (data as { debrief: { summary: string } }).debrief.summary ?? "",
        ).trim();
        if (source === "ai" && !summary) throw new Error("empty debrief");
        return data;
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("session_scorecard: total failure refunds when all tiers fail", async () => {
    const result = await simulateHybridExecution({
      route: sessionHybridRoute,
      creditCost: 15,
      runners: {
        deterministic: async () => {
          throw new Error("db down");
        },
        python: async () => null,
        ai: async () => {
          throw new Error("invalid json");
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
    }
  });

  it("analyze_test: cached database hit skips credit-consuming tiers", async () => {
    const result = await simulateHybridExecution({
      route: analyzeTestRoute,
      creditCost: 12,
      runners: {
        database: async () => ({ analysis: "cached narrative", cached: true }),
        deterministic: async () => {
          throw new Error("should not run when cache hits");
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("database");
      expect(result.data).toEqual({ analysis: "cached narrative", cached: true });
    }
  });
});
