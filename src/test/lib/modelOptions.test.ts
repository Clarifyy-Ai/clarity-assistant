import { describe, it, expect, beforeEach } from "vitest";
import {
  clampPreferredModel,
  hasProModelAccess,
  isFreeModel,
  isModelAvailableForPlan,
  normalizePreferredModel,
} from "@/lib/ai/modelOptions";
import {
  getModelLockReason,
  resetProviderFlagsForTests,
} from "@/lib/ai/providerAvailability";

describe("modelOptions plan gating", () => {
  it("marks GPT/Claude as Pro-only and Gemini as free", () => {
    expect(isFreeModel("gemini-flash")).toBe(true);
    expect(isFreeModel("gemini-pro")).toBe(true);
    expect(isFreeModel("gpt-4o")).toBe(false);
    expect(isFreeModel("claude-3-5-sonnet")).toBe(false);
  });

  it("locks Pro models for free/starter display tiers", () => {
    expect(hasProModelAccess("free")).toBe(false);
    expect(hasProModelAccess("starter")).toBe(false);
    expect(hasProModelAccess("pro")).toBe(true);
    expect(isModelAvailableForPlan("gpt-4o", "free")).toBe(false);
    expect(isModelAvailableForPlan("gemini-pro", "free")).toBe(true);
    expect(isModelAvailableForPlan("gpt-4o", "pro")).toBe(true);
  });

  it("clamps locked selections to gemini-flash", () => {
    expect(clampPreferredModel("gpt-4o", "free")).toBe("gemini-flash");
    expect(clampPreferredModel("claude-3-5-sonnet", "starter")).toBe("gemini-flash");
    expect(clampPreferredModel("gpt-4o", "pro")).toBe("gpt-4o");
  });

  it("normalizes legacy Gemini Pro aliases", () => {
    expect(normalizePreferredModel("gemini-1-5-pro")).toBe("gemini-pro");
    expect(normalizePreferredModel("gemini-1.5-pro")).toBe("gemini-pro");
  });
});

describe("model provider availability", () => {
  beforeEach(() => {
    resetProviderFlagsForTests({
      gemini: true,
      openai: false,
      anthropic: false,
      deepgram: true,
    });
  });

  it("marks GPT as unavailable when the OpenAI key is down", () => {
    expect(getModelLockReason("gpt-4o", "pro")).toBe("provider");
    expect(getModelLockReason("gemini-flash", "pro")).toBeNull();
  });

  it("still plan-locks GPT on free even if the provider is up", () => {
    resetProviderFlagsForTests({ gemini: true, openai: true, anthropic: true, deepgram: true });
    expect(getModelLockReason("gpt-4o", "free")).toBe("plan");
  });
});
