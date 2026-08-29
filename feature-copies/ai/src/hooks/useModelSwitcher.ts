import { useCallback } from "react";
import { useNetworkMonitor } from "./useNetworkMonitor";
import { useAuthStore } from "@/store/authStore";
import type { PreferredAIModel } from "@/types/user.types";
import {
  clampPreferredModel,
  isModelAvailableForPlan,
  MODEL_OPTIONS,
  normalizePreferredModel,
} from "@/lib/ai/modelOptions";

export type ModelCallType = "live_hint" | "mock_answer" | "analysis" | "star_generate" | "scorecard";

export function useModelSwitcher() {
  const { rttMs, mode } = useNetworkMonitor();
  const profile = useAuthStore((s) => s.profile);
  const planId = useAuthStore((s) => s.planId);

  const getModel = useCallback((callType: ModelCallType): PreferredAIModel => {
    const preferred = clampPreferredModel(
      (profile as { preferred_model?: PreferredAIModel } | null)?.preferred_model,
      planId,
    );
    if (mode === "offline") return "gemini-flash";
    if (mode === "degraded" && callType === "live_hint") return "gemini-flash";
    return preferred;
  }, [mode, rttMs, profile, planId]);

  const getModelLabel = useCallback((model: PreferredAIModel): string => {
    const slug = normalizePreferredModel(model);
    const fromOptions = MODEL_OPTIONS.find((m) => m.value === slug)?.label;
    if (fromOptions) return fromOptions;
    const labels: Partial<Record<PreferredAIModel, string>> = {
      "gemini-flash": "Gemini Flash",
      "gemini-pro": "Gemini Pro",
      "gpt-4o": "GPT-4o",
      "gpt-4o-mini": "GPT-4o mini",
      claude: "Claude",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-haiku": "Claude 3 Haiku",
      "gemini-1-5-pro": "Gemini Pro",
      "gemini-1-5-flash": "Gemini Flash",
    };
    return labels[model] ?? model;
  }, []);

  const isAvailable = useCallback(
    (model: PreferredAIModel): boolean => isModelAvailableForPlan(model, planId),
    [planId],
  );

  return {
    getModel,
    getModelLabel,
    isAvailable,
    currentNetworkMode: mode,
    rtt: rttMs,
  };
}
