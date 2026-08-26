import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  getAiUserFacingError,
  isAiProviderUnavailableError,
  isInsufficientCreditsError,
} from "@/lib/network/aiErrorUx";
import { createIdempotencyKey } from "@/lib/api/functions";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  simulateHybridExecution,
  type RouteFallbackFlags,
} from "../edge/hybridEnqueueFallbacks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

/** Mirrors MATRIX practice_coach_help. */
const practiceCoachRoute: RouteFallbackFlags = {
  preferredOrder: ["ai", "python", "deterministic"],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: false,
  canUseAI: true,
  canUsePython: true,
};

describe("Practice Coach AI Help error separation [T-12]", () => {
  it("maps provider 502 to unavailable, not insufficient credits", () => {
    const err = new ApiClientError({
      message: "AI Help is temporarily unavailable. Please try again.",
      status: 502,
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(isInsufficientCreditsError(err)).toBe(false);
    expect(isAiProviderUnavailableError(err)).toBe(true);
    expect(getAiUserFacingError(err)).toMatch(/temporarily unavailable/i);
  });

  it("maps provider 503 the same as 502 for unavailable UX", () => {
    const err = new ApiClientError({
      message: "AI service temporarily unavailable. Credits refunded.",
      status: 503,
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(isInsufficientCreditsError(err)).toBe(false);
    expect(isAiProviderUnavailableError(err)).toBe(true);
    expect(getAiUserFacingError(err)).toMatch(/temporarily unavailable/i);
  });

  it("keeps true 402 as insufficient credits", () => {
    const err = new ApiClientError({
      message: "Need credits",
      status: 402,
      code: "INSUFFICIENT_CREDITS",
    });
    expect(isInsufficientCreditsError(err)).toBe(true);
    expect(isAiProviderUnavailableError(err)).toBe(false);
  });

  it("does not treat CREDIT_SERVICE_UNAVAILABLE as out of credits", () => {
    const err = new ApiClientError({
      message: "Credit service down",
      status: 503,
      code: "CREDIT_SERVICE_UNAVAILABLE",
    });
    expect(isInsufficientCreditsError(err)).toBe(false);
  });

  it("creates stable-length idempotency keys for generate-answer", () => {
    const key = createIdempotencyKey("generate-answer");
    expect(key.startsWith("generate-answer:")).toBe(true);
    expect(key.length).toBeGreaterThanOrEqual(16);
  });
});

describe("Practice Coach hybrid fallback contracts (Wave 1 coach-prep)", () => {
  it("generate-hint throws on empty AI so python fallback can run", () => {
    const source = readFunction("generate-hint");
    expect(source).toContain('operation: "practice_coach_help"');
    expect(source).toContain('operation: "practice_coach"');
    expect(source).toContain("callPythonProcess");
    expect(source).toContain("normalizePythonCoachData");
    expect(source).toContain("AI returned empty hints");
    expect(source).not.toMatch(/source:\s*rawHints\s*\?\s*"ai"\s*:\s*"fallback"/);
    expect(source).toContain("hybridResult.response");
  });

  it("ai-coach-chat uses practice_coach via callPythonProcess (not scaffold)", () => {
    const source = readFunction("ai-coach-chat");
    expect(source).toContain('operation: "practice_coach_help"');
    expect(source).toContain('operation: "practice_coach"');
    expect(source).toContain("callPythonProcess");
    expect(source).toContain("normalizePythonCoachData");
    expect(source).toContain("AI returned empty coach reply");
    expect(source).not.toContain("practice_coach_hint");
  });

  it("generate-answer throws on empty AI before python fallback", () => {
    const source = readFunction("generate-answer");
    expect(source).toContain('operation: "live_answer"');
    expect(source).toContain('operation: "practice_coach"');
    expect(source).toContain("AI returned empty answer");
  });

  it("practice_coach_help: AI failure → python succeeds with single credit deduct", async () => {
    const result = await simulateHybridExecution({
      route: { ...practiceCoachRoute, preferredOrder: ["ai"] },
      creditCost: 2,
      runners: {
        ai: async () => {
          throw new Error("429 rate limit");
        },
        python: async () => ({
          hints: "• Use STAR\n• Quantify impact\n• Stay concise",
          source: "python_structured",
        }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("practice_coach_help: empty AI output fails validation and falls back", async () => {
    const result = await simulateHybridExecution({
      route: practiceCoachRoute,
      creditCost: 1,
      runners: {
        ai: async () => ({ hints: "" }),
        python: async () => ({ hints: "• Structured hint from python" }),
      },
      validate: async (data, source) => {
        if (source === "ai" && !(data as { hints: string }).hints.trim()) {
          throw new Error("empty hints");
        }
        return data;
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ hints: "• Structured hint from python" });
      expect(result.deductCount).toBe(1);
    }
  });
});
