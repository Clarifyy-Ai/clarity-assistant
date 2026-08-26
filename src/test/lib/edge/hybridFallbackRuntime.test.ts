import { describe, expect, it } from "vitest";
import {
  enqueueFallbacks,
  simulateHybridExecution,
  type HybridRouteSource,
  type RouteFallbackFlags,
} from "./hybridEnqueueFallbacks";

const practiceCoachRoute: RouteFallbackFlags = {
  preferredOrder: ["ai", "python", "deterministic"],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: false,
  canUseAI: true,
  canUsePython: true,
};

/** Mirrors MATRIX live_answer — same chain as practice_coach_help. */
const liveAnswerRoute: RouteFallbackFlags = { ...practiceCoachRoute };

/** Mirrors MATRIX prep_rephrase — AI preferred, deterministic fallback. */
const prepRephraseRoute: RouteFallbackFlags = {
  preferredOrder: ["ai", "python", "deterministic"],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: false,
  canUseAI: true,
  canUsePython: true,
};

/** Mirrors MATRIX star_builder — python stages draft, AI polishes. */
const starBuilderRoute: RouteFallbackFlags = {
  preferredOrder: ["python", "ai", "deterministic"],
  pythonFallbackOnAiFailure: true,
  aiFallbackOnPythonFailure: false,
  canCompleteDeterministically: true,
  canCompleteWithDatabase: false,
  canUseAI: true,
  canUsePython: true,
};

describe("enqueueFallbacks (hybrid pure mirror)", () => {
  it("on AI failure with pythonFallbackOnAiFailure enqueues python then deterministic", () => {
    const remaining: HybridRouteSource[] = [];
    const queued = new Set<HybridRouteSource>(["ai"]);
    enqueueFallbacks("ai", practiceCoachRoute, remaining, queued);
    expect(remaining).toEqual(["python", "deterministic"]);
    expect(queued.has("python")).toBe(true);
    expect(queued.has("deterministic")).toBe(true);
  });

  it("does not duplicate sources already queued", () => {
    const remaining: HybridRouteSource[] = ["python"];
    const queued = new Set<HybridRouteSource>(["ai", "python"]);
    enqueueFallbacks("ai", practiceCoachRoute, remaining, queued);
    expect(remaining).toEqual(["python", "deterministic"]);
  });

  it("does not enqueue python when pythonFallbackOnAiFailure is false", () => {
    const remaining: HybridRouteSource[] = [];
    const queued = new Set<HybridRouteSource>(["ai"]);
    enqueueFallbacks(
      "ai",
      { ...practiceCoachRoute, pythonFallbackOnAiFailure: false },
      remaining,
      queued,
    );
    expect(remaining).toEqual([]);
  });
});

describe("simulateHybridExecution credit + fallback", () => {
  it("AI unavailable → python/deterministic succeeds without a second credit charge", async () => {
    const result = await simulateHybridExecution({
      route: { ...practiceCoachRoute, canUseAI: false },
      creditCost: 2,
      runners: {
        ai: async () => {
          throw new Error("should not run when canUseAI=false");
        },
        python: async () => ({ help: "from-python" }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ help: "from-python" });
      expect(result.source).toBe("python");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("AI runtime failure → enqueues python and still deducts only once", async () => {
    // preferredOrder is AI-only; python arrives only via enqueueFallbacks.
    const result = await simulateHybridExecution({
      route: {
        ...practiceCoachRoute,
        preferredOrder: ["ai"],
      },
      creditCost: 3,
      runners: {
        ai: async () => {
          throw new Error("provider down");
        },
        python: async () => ({ help: "fallback" }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.data).toEqual({ help: "fallback" });
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
      expect(result.fallbackReason).toMatch(/ai_failed/);
    }
  });

  it("total failure refunds reserved credits once", async () => {
    const result = await simulateHybridExecution({
      route: {
        ...practiceCoachRoute,
        canCompleteDeterministically: false,
        canUsePython: false,
      },
      creditCost: 5,
      runners: {
        ai: async () => {
          throw new Error("AI down");
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

  it("CONTENT/validation failure does not fake success", async () => {
    const result = await simulateHybridExecution({
      route: {
        ...practiceCoachRoute,
        canUsePython: false,
        canCompleteDeterministically: false,
      },
      creditCost: 1,
      runners: {
        ai: async () => ({ text: "garbage" }),
      },
      validate: () => {
        throw new Error("validation failed: schema");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_INVALID_OUTPUT");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
      expect(result.fallbackReason).toMatch(/validate_failed/);
    }
  });

  it("validation fail on AI then successful deterministic fallback still charges once", async () => {
    const result = await simulateHybridExecution({
      route: practiceCoachRoute,
      creditCost: 1,
      runners: {
        ai: async () => ({ text: "bad" }),
        deterministic: async () => ({ text: "safe-template" }),
      },
      validate: async (data, source) => {
        if (source === "ai") throw new Error("invalid output");
        return data;
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ text: "safe-template" });
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("live_answer: AI failure → python succeeds with single credit deduct", async () => {
    const result = await simulateHybridExecution({
      route: { ...liveAnswerRoute, preferredOrder: ["ai"] },
      creditCost: 8,
      runners: {
        ai: async () => {
          throw new Error("provider down");
        },
        python: async () => ({ answer: "structured fallback" }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.data).toEqual({ answer: "structured fallback" });
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
      expect(result.fallbackReason).toMatch(/ai_failed/);
    }
  });

  it("practice_coach_help: AI failure → python fallback (same chain as live_answer)", async () => {
    const result = await simulateHybridExecution({
      route: { ...practiceCoachRoute, preferredOrder: ["ai"] },
      creditCost: 2,
      runners: {
        ai: async () => {
          throw new Error("429 rate limit");
        },
        python: async () => ({ reply: "coach hint", hints: ["use STAR"] }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("prep_rephrase: AI failure → deterministic succeeds without second deduct", async () => {
    const result = await simulateHybridExecution({
      route: { ...prepRephraseRoute, preferredOrder: ["ai"] },
      creditCost: 1,
      runners: {
        ai: async () => {
          throw new Error("AI unavailable");
        },
        deterministic: async () => ({
          rephrased: "cleaned deterministic text",
        }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.data).toEqual({ rephrased: "cleaned deterministic text" });
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
      expect(result.fallbackReason).toMatch(/ai_failed/);
    }
  });

  it("prep_rephrase: AI validation fail → deterministic fallback, no fake success", async () => {
    const result = await simulateHybridExecution({
      route: prepRephraseRoute,
      creditCost: 1,
      runners: {
        ai: async () => ({ rephrased: "" }),
        deterministic: async () => ({ rephrased: "um removed from input" }),
      },
      validate: async (data, source) => {
        if (source === "ai" && !(data as { rephrased: string }).rephrased.trim()) {
          throw new Error("empty rephrase");
        }
        return data;
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ rephrased: "um removed from input" });
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });

  it("total failure refunds exactly once across AI→python→deterministic walk", async () => {
    const result = await simulateHybridExecution({
      route: { ...liveAnswerRoute, preferredOrder: ["ai"] },
      creditCost: 8,
      runners: {
        ai: async () => {
          throw new Error("AI down");
        },
        python: async () => {
          throw new Error("python down");
        },
        deterministic: async () => null,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(1);
      expect(result.fallbackReason).toBeDefined();
    }
  });

  it("star_builder: python skip stages draft → AI polish succeeds", async () => {
    let stagedDraft: string | null = null;
    const result = await simulateHybridExecution({
      route: starBuilderRoute,
      creditCost: 3,
      runners: {
        python: async () => {
          stagedDraft = "Situation: led team";
          return null;
        },
        ai: async () => ({
          polished: `Polished: ${stagedDraft}`,
          source: "ai",
        }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("ai");
      expect(result.data).toEqual({
        polished: "Polished: Situation: led team",
        source: "ai",
      });
      expect(result.deductCount).toBe(1);
    }
  });

  it("star_builder: AI failure → deterministic uses staged python draft", async () => {
    let stagedDraft: { situation: string } | null = null;
    const result = await simulateHybridExecution({
      route: starBuilderRoute,
      creditCost: 2,
      runners: {
        python: async () => {
          stagedDraft = { situation: "python draft" };
          return null;
        },
        ai: async () => {
          throw new Error("AI polish unavailable");
        },
        deterministic: async () => stagedDraft,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("deterministic");
      expect(result.data).toEqual({ situation: "python draft" });
      expect(result.deductCount).toBe(1);
      expect(result.refundCount).toBe(0);
    }
  });
});
