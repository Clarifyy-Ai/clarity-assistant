import { useCallback } from "react";
import { useNetworkMonitor } from "./useNetworkMonitor";
import { useAuthStore } from "@/store/userStore";
import { selectModel } from "@/lib/ai/modelRouter";
import type { AIModel } from "@/types/ai.types";

// ─────────────────────────────────────────────────────────────────
// useModelSwitcher
// Determines the best AI model to use for a given call based on:
//   - Network quality (RTT)
//   - User's plan + preferred model
//   - Call type (live hint vs full mock vs analysis)
// ─────────────────────────────────────────────────────────────────

export type ModelCallType = "live_hint" | "mock_answer" | "analysis" | "star_generate" | "scorecard";

export function useModelSwitcher() {
  const { rtt, mode } = useNetworkMonitor();
  const { profile }   = useAuthStore();

  // ── Get model for a specific call type ───────────────────────

  const getModel = useCallback((callType: ModelCallType): AIModel => {
    return selectModel({
      callType,
      networkMode:    mode,
      rttMs:          rtt,
      userPlan:       profile?.plan       ?? "free",
      preferredModel: profile?.preferred_model ?? "gemini-flash",
      byokModels:     profile?.byok_models ?? [],
    });
  }, [mode, rtt, profile?.plan, profile?.preferred_model, profile?.byok_models]);

  // ── Override model for current session ───────────────────────

  const getModelLabel = useCallback((model: AIModel): string => {
    const labels: Record<AIModel, string> = {
      "gemini-flash": "Gemini Flash ⚡",
      "gemini-pro":   "Gemini Pro",
      "gpt-4o":       "GPT-4o",
      "claude-3-5":   "Claude 3.5",
    };
    return labels[model] ?? model;
  }, []);

  // ── Check if a model is available on the user's plan ─────────

  const isAvailable = useCallback((model: AIModel): boolean => {
    const plan = profile?.plan ?? "free";
    if (plan === "free") return model === "gemini-flash";
    if (model === "gpt-4o" || model === "claude-3-5") return plan !== "free";
    return true;
  }, [profile?.plan]);

  return {
    getModel,
    getModelLabel,
    isAvailable,
    currentNetworkMode: mode,
    rtt,
  };
}
