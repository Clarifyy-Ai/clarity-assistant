import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { NetworkMode, NetworkState } from "@/types/ai.types";
import type { PreferredAIModel } from "@/types/user.types";

// ─────────────────────────────────────────────────────────────────
// Network Store
// ─────────────────────────────────────────────────────────────────

interface NetworkStore extends NetworkState {
  // Probe history (last 10 RTT measurements)
  rtt_history: number[];
  avg_rtt: number;
  probe_count: number;
  is_probing: boolean;

  // Response time tracking
  last_ai_response_ms: number | null;
  avg_ai_response_ms: number;
  ai_response_history: number[];

  // Fallback state
  is_offline_fallback_active: boolean;
  offline_fallback_since: number | null;   // ms epoch
  queued_hint_request: boolean;

  // Actions
  recordRTT: (rtt_ms: number) => void;
  setMode: (mode: NetworkMode) => void;
  setModelOverride: (model: PreferredAIModel | null) => void;
  setIsProbing: (probing: boolean) => void;
  recordAIResponseTime: (ms: number) => void;
  activateOfflineFallback: () => void;
  deactivateOfflineFallback: () => void;
  setQueuedHintRequest: (queued: boolean) => void;

  // Computed
  getEffectiveModel: (preferred: PreferredAIModel) => PreferredAIModel;
  getOverlayColor: () => "green" | "yellow" | "red";
}

function computeMode(avgRTT: number): NetworkMode {
  if (avgRTT === 0)    return "offline";
  if (avgRTT < 800)    return "strong";
  if (avgRTT < 2000)   return "degraded";
  return "offline";
}

function computeAvg(history: number[]): number {
  if (history.length === 0) return 0;
  return Math.round(history.reduce((a, b) => a + b, 0) / history.length);
}

export const useNetworkStore = create<NetworkStore>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ──────────────────────────────────────
    mode: "strong",
    rtt_ms: null,
    model_override: null,
    last_checked_at: Date.now(),

    rtt_history: [],
    avg_rtt: 0,
    probe_count: 0,
    is_probing: false,

    last_ai_response_ms: null,
    avg_ai_response_ms: 0,
    ai_response_history: [],

    is_offline_fallback_active: false,
    offline_fallback_since: null,
    queued_hint_request: false,

    // ── Actions ────────────────────────────────────────────
    recordRTT: (rtt_ms) => {
      set((state) => {
        const history = [...state.rtt_history, rtt_ms].slice(-10);
        const avg_rtt = computeAvg(history);
        const mode = computeMode(avg_rtt);

        // Auto-select faster model on degraded network
        let model_override: PreferredAIModel | null = null;
        if (mode === "degraded") model_override = "gemini-flash";
        if (mode === "offline")  model_override = null;

        return {
          rtt_ms,
          rtt_history: history,
          avg_rtt,
          mode,
          model_override,
          last_checked_at: Date.now(),
          probe_count: state.probe_count + 1,
        };
      });
    },

    setMode: (mode) => set({ mode }),

    setModelOverride: (model_override) => set({ model_override }),

    setIsProbing: (is_probing) => set({ is_probing }),

    recordAIResponseTime: (ms) =>
      set((state) => {
        const history = [...state.ai_response_history, ms].slice(-20);
        return {
          last_ai_response_ms: ms,
          avg_ai_response_ms: computeAvg(history),
          ai_response_history: history,
        };
      }),

    activateOfflineFallback: () =>
      set({
        is_offline_fallback_active: true,
        offline_fallback_since: Date.now(),
        mode: "offline",
      }),

    deactivateOfflineFallback: () =>
      set({
        is_offline_fallback_active: false,
        offline_fallback_since: null,
      }),

    setQueuedHintRequest: (queued_hint_request) =>
      set({ queued_hint_request }),

    // ── Computed ───────────────────────────────────────────
    getEffectiveModel: (preferred) => {
      const { model_override } = get();
      return model_override ?? preferred;
    },

    getOverlayColor: () => {
      const { mode } = get();
      if (mode === "strong")   return "green";
      if (mode === "degraded") return "yellow";
      return "red";
    },
  }))
);
