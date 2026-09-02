import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { httpStatusForDomainCode } from "../../../../supabase/functions/_shared/domainErrors";
import {
  simulateHybridExecution,
  type RouteFallbackFlags,
} from "./hybridEnqueueFallbacks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions", name, "index.ts"), "utf8");
}

function readShared(name: string): string {
  return fs.readFileSync(path.join(root, "supabase/functions/_shared", name), "utf8");
}

const PREP_RAW_PROMPT_ROUTE: RouteFallbackFlags = {
  preferredOrder: ["ai", "python", "deterministic"],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: false,
  canUseAI: true,
  canUsePython: true,
};

describe("Answer Bank AI generation (prep-tool)", () => {
  const prepTool = readFunction("prep-tool");
  const answerBank = fs.readFileSync(
    path.join(root, "src/pages/app/answer-bank/AnswerBank.tsx"),
    "utf8",
  );

  it("routes raw_prompt through executeHybridOperation with prep_raw_prompt", () => {
    expect(prepTool).toContain('tool_id === "raw_prompt"');
    expect(prepTool).toContain('operation: "prep_raw_prompt"');
    expect(prepTool).toContain("deterministicRawPromptContent");
    expect(prepTool).toContain("formatRawPromptFromPython");
    expect(prepTool).toContain("pythonExecuteOperation");
    expect(prepTool).toContain("executeHybridOperation");
  });

  it("star_method remains on hybrid star_builder path for behavioural categories", () => {
    expect(prepTool).toContain('tool_id === "star_method"');
    expect(prepTool).toContain('operation: "star_builder"');
    expect(answerBank).toContain('"star_method"');
    expect(answerBank).toContain('"raw_prompt"');
  });

  it("star_method returns python outline instead of deferring to AI (avoids 503 when Gemini is down)", () => {
    expect(prepTool).toContain("deterministicStarOutline");
    expect(prepTool).toContain("return pythonStarMethodDraft");
    expect(prepTool).not.toContain("Defer success to runAi");
    const router = readShared("operationRouter.ts");
    expect(router).toMatch(
      /star_builder:[\s\S]*preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\]/,
    );
  });

  it("Answer Bank uses content-stable idempotency keys (not random per click)", () => {
    expect(answerBank).toContain("prepToolContentIdempotencyKey");
    expect(answerBank).toContain("parsePrepToolResponse");
    expect(answerBank).toContain("sha256");
    expect(answerBank).not.toContain('createIdempotencyKey("answer-bank-ai")');
    expect(answerBank).toContain("timeoutMs: 90_000");
  });

  it("star_method and raw_prompt return successResponse (not raw hybrid envelope)", () => {
    const prepTool = readFunction("prep-tool");
    expect(prepTool).toMatch(
      /tool_id === "star_method"[\s\S]*return successResponse\([\s\S]*result: payload\.result/,
    );
    expect(prepTool).toMatch(
      /tool_id === "raw_prompt"[\s\S]*return successResponse\([\s\S]*result: payload\.result/,
    );
  });

  it("refunds credits on raw_prompt hybrid total failure", () => {
    expect(prepTool).toMatch(
      /prep_raw_prompt[\s\S]*if \(!hybrid\.ok\)[\s\S]*hybridPublicFailure/,
    );
    const hybrid = readShared("hybridExecute.ts");
    expect(hybrid).toContain("refundCredits");
    expect(hybrid).toMatch(/creditsReserved && !creditFinalized/);
  });

  it("maps provider failures to PROVIDER_UNAVAILABLE at 503 (never raw gateway)", () => {
    expect(httpStatusForDomainCode("AI_PROVIDER_UNAVAILABLE")).toBe(503);
    expect(prepTool).toContain("PROVIDER_UNAVAILABLE");
    expect(prepTool).toContain("Credits refunded");
    expect(prepTool).not.toMatch(/PROVIDER_UNAVAILABLE[\s\S]{0,80},\s*502\b/);
  });

  it("aiProvider applies bounded retries for all providers including Gemini", () => {
    const aiProvider = readShared("aiProvider.ts");
    expect(aiProvider).toContain("const attempts = MAX_RETRIES");
    expect(aiProvider).not.toMatch(/const attempts = isGemini \? 1 : MAX_RETRIES/);
    expect(aiProvider).toContain("RETRY_DELAY_MS");
    expect(aiProvider).toContain("REQUEST_TIMEOUT_MS");
  });

  it("operationRouter defines prep_raw_prompt with ai → python → deterministic fallback", () => {
    const router = readShared("operationRouter.ts");
    expect(router).toContain("prep_raw_prompt:");
    expect(router).toMatch(
      /prep_raw_prompt:[\s\S]*preferredOrder:\s*\["ai",\s*"python",\s*"deterministic"\]/,
    );
    expect(router).toMatch(/prep_raw_prompt:[\s\S]*pythonFallbackOnAiFailure:\s*true/);
  });
});

describe("prep_raw_prompt hybrid simulation", () => {
  it("succeeds via AI when provider is healthy", async () => {
    const result = await simulateHybridExecution({
      route: PREP_RAW_PROMPT_ROUTE,
      creditCost: 3,
      runners: {
        ai: async () => ({ result: "Strong technical answer.", source: "ai" }),
      },
      validate: (data) => data,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.result).toContain("Strong technical");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("falls back to python when AI throws provider 5xx", async () => {
    const result = await simulateHybridExecution({
      route: PREP_RAW_PROMPT_ROUTE,
      creditCost: 3,
      runners: {
        ai: async () => {
          throw new Error("Gemini API error (503): Service Unavailable");
        },
        python: async () => ({
          result:
            "**Technical interview answer (structured outline)**\n\n**Question:** design a cache\n\n**Opening:** Frame the problem.",
          source: "python",
        }),
      },
      validate: (data) => data,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("python");
      expect(result.data.source).toBe("python");
      expect(result.refundCount).toBe(0);
    }
  });

  it("falls back to deterministic when AI throws provider 5xx", async () => {
    const result = await simulateHybridExecution({
      route: PREP_RAW_PROMPT_ROUTE,
      creditCost: 3,
      runners: {
        ai: async () => {
          throw new Error("Gemini API error (503): Service Unavailable");
        },
        deterministic: async () => ({
          result: "**Technical interview answer (structured outline)**\n\n**Question:** design a cache",
          source: "deterministic",
        }),
      },
      validate: (data) => data,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("deterministic");
      expect(result.data.source).toBe("deterministic");
      expect(result.refundCount).toBe(0);
    }
  });

  it("refunds credits when AI times out and deterministic is unavailable", async () => {
    const result = await simulateHybridExecution({
      route: { ...PREP_RAW_PROMPT_ROUTE, canCompleteDeterministically: false },
      creditCost: 3,
      runners: {
        ai: async () => {
          throw new Error("Gemini request timed out after 50000ms.");
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_PROVIDER_UNAVAILABLE");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
    }
  });

  it("refunds credits when AI returns empty output", async () => {
    const result = await simulateHybridExecution({
      route: PREP_RAW_PROMPT_ROUTE,
      creditCost: 3,
      runners: {
        ai: async () => ({ result: "", source: "ai" }),
        deterministic: async () => null,
      },
      validate: (data) => {
        if (!data.result?.trim()) throw new Error("empty");
        return data;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refundCount).toBe(1);
    }
  });

  it("refunds credits when AI output fails validation (malformed)", async () => {
    const result = await simulateHybridExecution({
      route: PREP_RAW_PROMPT_ROUTE,
      creditCost: 3,
      runners: {
        ai: async () => ({ result: "   ", source: "ai" }),
        deterministic: async () => null,
      },
      validate: (data) => {
        if (!data.result?.trim()) throw new Error("AI_RESPONSE_INVALID");
        return data;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refundCount).toBe(1);
    }
  });

  it("retries are bounded — single deduct per hybrid attempt", async () => {
    let aiCalls = 0;
    const result = await simulateHybridExecution({
      route: PREP_RAW_PROMPT_ROUTE,
      creditCost: 3,
      runners: {
        ai: async () => {
          aiCalls += 1;
          throw new Error("503 unavailable");
        },
        deterministic: async () => ({
          result: "Outline fallback with enough content to pass validation checks easily.",
          source: "deterministic",
        }),
      },
      validate: (data) => data,
    });
    expect(aiCalls).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deductCount).toBe(1);
    }
  });
});
