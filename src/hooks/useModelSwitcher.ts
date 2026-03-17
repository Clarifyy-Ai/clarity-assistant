import { useCallback } from "react";
import { useNetworkMonitor } from "./useNetworkMonitor";
import { useAuthStore } from "@/store/userStore";
import type { PreferredAIModel } from "@/types/user.types";

export type ModelCallType = "live_hint" | "mock_answer" | "analysis" | "star_generate" | "scorecard";

export function useModelSwitcher() {
  const { rttMs, mode } = useNetworkMonitor();
  const { profile }     = useAuthStore();

  const getModel = useCallback((callType: ModelCallType): PreferredAIModel => {
    const preferred = profile?.preferred_model ?? "gemini-flash";
    if (mode === "offline") return "gemini-flash";
    if (mode === "degraded" && callType === "live_hint") return "gemini-flash";
    return preferred;
  }, [mode, rttMs, profile?.preferred_model]);

  const getModelLabel = useCallback((model: PreferredAIModel): string => {
    const labels: Record<PreferredAIModel, string> = {
      "gemini-flash": "Gemini Flash ⚡",
      "gemini-pro":   "Gemini Pro",
      "gpt-4o":       "GPT-4o",
      "claude":       "Claude",
    };
    return labels[model] ?? model;
  }, []);

  const isAvailable = useCallback((model: PreferredAIModel): boolean => {
    const plan = profile?.plan ?? "free";
    if (plan === "free") return model === "gemini-flash";
    return true;
  }, [profile?.plan]);

  return {
    getModel,
    getModelLabel,
    isAvailable,
    currentNetworkMode: mode,
    rtt: rttMs,
  };
}
