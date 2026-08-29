import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideRoute } from "@/lib/ai/aiHubAnalyzer";
import { getHubModel } from "@/lib/ai/aiHubRegistry";
import {
  buildHubTryModels,
  walkHubFallbackChain,
} from "@/lib/ai/aiHubFallbackWalk";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("AI Hub fallbackChain walk", () => {
  it("tries second model when the first fails", () => {
    const decision = decideRoute({ prompt: "Summarize this article briefly" });
    expect(decision.fallbackChain.length).toBeGreaterThan(0);

    const attempted: string[] = [];
    const walk = walkHubFallbackChain({
      primary: { model: decision.model, provider: decision.provider },
      fallbackChain: decision.fallbackChain,
      attempt: (sel) => {
        attempted.push(sel.model);
        if (sel.model === decision.model) {
          return {
            success: false,
            model: sel.model,
            errorCode: "PROVIDER_UNAVAILABLE",
            errorMessage: "primary down",
          };
        }
        return {
          success: true,
          model: sel.model,
          responseText: "ok",
        };
      },
    });

    expect(walk.exhausted).toBe(false);
    expect(walk.wasFallback).toBe(true);
    expect(walk.result.success).toBe(true);
    expect(walk.usedModel).not.toBe(decision.model);
    expect(attempted[0]).toBe(decision.model);
    expect(attempted[1]).toBe(walk.usedModel);
    expect(getHubModel(walk.usedModel)).toBeTruthy();
  });

  it("returns structured error when all models in the chain fail (not silent success)", () => {
    const decision = decideRoute({ prompt: "What is React?" });
    const candidates = buildHubTryModels(
      { model: decision.model },
      decision.fallbackChain,
    );
    expect(candidates.length).toBeGreaterThan(1);

    const walk = walkHubFallbackChain({
      primary: { model: decision.model, provider: decision.provider },
      fallbackChain: decision.fallbackChain,
      attempt: (sel) => ({
        success: false,
        model: sel.model,
        errorCode: "PROVIDER_UNAVAILABLE",
        errorMessage: `${sel.model} unavailable`,
      }),
    });

    expect(walk.exhausted).toBe(true);
    expect(walk.result.success).toBe(false);
    expect(walk.result.errorCode).toBeTruthy();
    expect(walk.result.errorCode).not.toBe("OK");
    expect(walk.tried.length).toBe(candidates.length);
    expect(walk.tried[0]).toBe(decision.model);
  });

  it("emits ROUTING_EXHAUSTED when no candidate is eligible", () => {
    const walk = walkHubFallbackChain({
      primary: { model: "gemini-2.5-flash", provider: "gemini" },
      fallbackChain: ["gpt-4o-mini"],
      isEligible: () => false,
      attempt: () => ({
        success: true,
        model: "should-not-run",
        responseText: "leak",
      }),
    });
    expect(walk.exhausted).toBe(true);
    expect(walk.result.success).toBe(false);
    expect(walk.result.errorCode).toBe("ROUTING_EXHAUSTED");
    expect(walk.tried).toEqual([]);
  });

  it("Edge ai-hub-router walks routeFallbackChain then records success:false on failure", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/ai-hub-router/index.ts"),
      "utf8",
    );
    expect(src).toContain("routeFallbackChain");
    expect(src).toContain("for (const candidate of tryModels)");
    expect(src).toContain("if (attempt.success) break");
    expect(src).toContain("ROUTING_EXHAUSTED");
    expect(src).toContain("success: gen.success");
    expect(src).toContain("error_code: gen.errorCode ?? null");
    // Must not treat exhausted walks as success
    expect(src).not.toMatch(/exhausted\s*=\s*true[\s\S]{0,200}success:\s*true/);
  });
});
