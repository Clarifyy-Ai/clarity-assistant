import { useCallback } from "react";
import { useNetworkMonitor } from "./useNetworkMonitor";
import { useAuthStore } from "@/store/authStore";
import type { PreferredAIModel } from "@/types/user.types";

export type ModelCallType = "live_hint" | "mock_answer" | "analysis" | "star_generate" | "scorecard";

export function useModelSwitcher() {
  const { rttMs, mode } = useNetworkMonitor();
  const { profile }     = useAuthStore();

  const getModel = useCallback((callType: ModelCallType): PreferredAIModel => {
    const preferred = (profile as { preferred_model?: PreferredAIModel } | null)?.preferred_model ?? "gemini-flash";
    if (mode === "offline") return "gemini-flash";
    if (mode === "degraded" && callType === "live_hint") return "gemini-flash";
    return preferred;
  }, [mode, rttMs, profile]);

  const getModelLabel = useCallback((model: PreferredAIModel): string => {
    const labels: Record<PreferredAIModel, string> = {
      "gemini-flash": "Gemini Flash ⚡",
      "gemini-pro":   "Gemini Pro",
      "gpt-4o":       "GPT-4o",
      "gpt-4o-mini":  "GPT-4o mini",
      "claude":       "Claude",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-haiku": "Claude 3 Haiku",
      "gemini-1-5-pro": "Gemini 1.5 Pro",
      "gemini-1-5-flash": "Gemini 1.5 Flash",
    };
    return labels[model] ?? model;
  }, []);

  const isAvailable = useCallback((model: PreferredAIModel): boolean => {
    const plan = (profile as { plan?: string } | null)?.plan ?? "free";
    if (plan === "free") return model === "gemini-flash";
    return true;
  }, [profile]);

  return {
    getModel,
    getModelLabel,
    isAvailable,
    currentNetworkMode: mode,
    rtt: rttMs,
  };
}
