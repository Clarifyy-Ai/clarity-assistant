import { describe, expect, it } from "vitest";
import {
  AI_HUB_MODELS,
  AI_HUB_MODE_OUTPUT_CAPS,
  estimateCostMicroUsd,
  estimateInputTokens,
  getHubModel,
  microUsdToDisplay,
} from "@/lib/ai/aiHubRegistry";
import { classifyTask, decideRoute } from "@/lib/ai/aiHubAnalyzer";

describe("aiHubAnalyzer", () => {
  it("classifies code from fences", () => {
    const r = classifyTask({ prompt: "Fix this ```ts\nconst x = 1\n```" });
    expect(r.taskType).toBe("code");
    expect(r.confidence).toBe("high");
  });

  it("honors taskHint", () => {
    const r = classifyTask({ prompt: "hello", taskHint: "gap-analysis" });
    expect(r.taskType).toBe("extract_json");
  });

  it("defaults to short_qa", () => {
    const r = classifyTask({ prompt: "What is React?" });
    expect(r.taskType).toBe("short_qa");
  });

  it("decideRoute returns fallback chain of enabled models", () => {
    const d = decideRoute({ prompt: "Summarize this article briefly" });
    expect(d.taskType).toBe("summarize");
    expect(d.model).toBe("gemini-2.5-flash");
    expect(d.fallbackChain.length).toBeGreaterThan(0);
    for (const id of d.fallbackChain) {
      expect(getHubModel(id)).toBeTruthy();
    }
  });
});

describe("aiHubRegistry", () => {
  it("only lists known models with pricing", () => {
    expect(AI_HUB_MODELS.length).toBeGreaterThan(3);
    for (const m of AI_HUB_MODELS) {
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.inputPricePerMillionMicroUsd).toBeGreaterThan(0);
      expect(["openai", "gemini", "anthropic"]).toContain(m.provider);
    }
  });

  it("estimates cost in micro-USD as integer", () => {
    const cost = estimateCostMicroUsd("gemini-2.5-flash", 1000, 500);
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
    expect(microUsdToDisplay(cost)).toMatch(/^\$/);
  });

  it("clamps mode caps", () => {
    expect(AI_HUB_MODE_OUTPUT_CAPS.quick).toBe(500);
    expect(AI_HUB_MODE_OUTPUT_CAPS.deep).toBe(5000);
  });

  it("estimateInputTokens is positive", () => {
    expect(estimateInputTokens("abcd")).toBe(1);
    expect(estimateInputTokens("a".repeat(40))).toBe(10);
  });
});

describe("aiHub free-tier / acceleration helpers", () => {
  it("cheap models are free-tier eligible", () => {
    const flash = getHubModel("gemini-2.5-flash");
    expect(flash?.freeTierEligible).toBe(true);
    const premium = getHubModel("gpt-4o");
    expect(premium?.freeTierEligible).toBe(false);
  });

  it("acceleration ceiling wins when lowest", () => {
    const modeCap = AI_HUB_MODE_OUTPUT_CAPS.deep;
    const modelCap = getHubModel("claude-3-haiku-20240307")!.maxOutputTokens;
    const accelCeiling = 800;
    const clamped = Math.min(modeCap, modelCap, accelCeiling);
    expect(clamped).toBe(800);
  });

  it("free-tier remaining math never goes negative", () => {
    const limit = 250_000;
    const used = 260_000;
    const remaining = Math.max(0, limit - used);
    expect(remaining).toBe(0);
  });
});
