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

/** Mirrors MATRIX practice_coach_help (AI-only fail-closed). */
const practiceCoachRoute: RouteFallbackFlags = {
  preferredOrder: ["ai"],
  pythonFallbackOnAiFailure: false,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: false,
  canCompleteWithDatabase: false,
  canUseAI: true,
  canUsePython: true,
  isAiRequired: true,
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

  it("maps practice SESSION_EXPIRED to start-new-session copy, not sign-in", () => {
    const err = new ApiClientError({
      message: "Session expired",
      status: 409,
      code: "SESSION_EXPIRED",
    });
    expect(getAiUserFacingError(err)).toMatch(/practice session has expired/i);
    expect(getAiUserFacingError(err)).not.toMatch(/sign in/i);
  });

  it("maps AUTH_EXPIRED to sign-in copy", () => {
    const err = new ApiClientError({
      message: "JWT expired",
      status: 401,
      code: "AUTH_EXPIRED",
    });
    expect(getAiUserFacingError(err)).toMatch(/sign in again/i);
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

  it("differentiates credit-service 503 from AI provider 503", () => {
    const credit = new ApiClientError({
      message: "Credits couldn't be verified right now. Please try again.",
      status: 503,
      code: "CREDIT_SERVICE_UNAVAILABLE",
    });
    const ai = new ApiClientError({
      message: "Coach AI is temporarily unavailable. Try again in a moment.",
      status: 503,
      code: "AI_PROVIDER_UNAVAILABLE",
    });
    expect(isAiProviderUnavailableError(credit)).toBe(false);
    expect(getAiUserFacingError(credit)).toMatch(/credits couldn't be verified/i);
    expect(isAiProviderUnavailableError(ai)).toBe(true);
    expect(getAiUserFacingError(ai)).toMatch(/temporarily unavailable/i);
  });

  it("maps empty coach output to AI_INVALID_OUTPUT UX contract (422)", () => {
    const err = new ApiClientError({
      message: "Coach returned an incomplete reply. Please try again.",
      status: 422,
      code: "AI_INVALID_OUTPUT",
    });
    expect(isInsufficientCreditsError(err)).toBe(false);
    expect(isAiProviderUnavailableError(err)).toBe(false);
    expect(err.code).toBe("AI_INVALID_OUTPUT");
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

  it("ai-coach-chat requires Gemini AI and refuses python/deterministic scaffolds", () => {
    const source = readFunction("ai-coach-chat");
    expect(source).toContain('operation: "practice_coach_help"');
    expect(source).toContain("AI returned empty coach reply");
    expect(source).toContain('runPython: async () => null');
    expect(source).toContain('runDeterministic: async () => null');
    expect(source).toContain('data.source !== "ai"');
    expect(source).toContain("AI_PROVIDER_UNAVAILABLE");
    expect(source).toContain("COACH_AI_UNAVAILABLE_MESSAGE");
    expect(source).toContain("generateWithFallback");
    expect(source).not.toContain("deterministicCoachChatReply");
    expect(source).not.toContain("normalizePythonCoachData");
    expect(source).not.toContain("You asked:");
  });

  it("ai-coach-chat maps app model slugs via resolveModel (BUG 09)", () => {
    const source = readFunction("ai-coach-chat");
    expect(source).toContain('from "../_shared/resolveModel.ts"');
    expect(source).toContain("resolveModel");
    expect(source).toContain("isGeminiModel");
    expect(source).toContain("await resolveModel(db, user.id, body.model)");
    // Must not pass gemini-flash app slug straight to Gemini API.
    expect(source).not.toMatch(
      /function sanitizeModel\([\s\S]*?return model;\s*\}/,
    );
    const hint = readFunction("generate-hint");
    expect(hint).toContain("resolveModel");
  });

  it("deterministicCoachChatReply is not a You-asked STAR scaffold", () => {
    const contract = fs.readFileSync(
      path.join(functionsDir, "_shared/practiceCoachContract.ts"),
      "utf8",
    );
    expect(contract).toContain("deterministicCoachChatReply");
    expect(contract).not.toMatch(/You asked:/);
    expect(contract).not.toMatch(/I will not invent facts/);
    expect(contract).toMatch(/temporarily unavailable/i);
  });

  it("generate-answer throws on empty AI before python fallback", () => {
    const source = readFunction("generate-answer");
    expect(source).toContain('operation: "live_answer"');
    expect(source).toContain('operation: "practice_coach"');
    expect(source).toContain("AI returned empty answer");
  });

  it("hybrid AI-required empty queue fails as AI_PROVIDER_UNAVAILABLE with refund", async () => {
    const result = await simulateHybridExecution({
      route: {
        ...practiceCoachRoute,
        canUseAI: false,
      },
      creditCost: 2,
      runners: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_PROVIDER_UNAVAILABLE");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
    }
  });

  it("practice_coach_help: AI failure fails closed with credit refund (no python scaffold)", async () => {
    const result = await simulateHybridExecution({
      route: practiceCoachRoute,
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
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_PROVIDER_UNAVAILABLE");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
    }
  });

  it("practice_coach_help: empty AI output fails closed (no deterministic/python answer)", async () => {
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
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
    }
  });
});
