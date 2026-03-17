import { useEffect, useCallback } from "react";
import { useNetworkStore } from "@/store/networkStore";
import { useUIStore } from "@/store/uiStore";
import { networkMonitor } from "@/lib/network/networkMonitor";

// ─────────────────────────────────────────────────────────────────
// useNetworkMonitor
// Starts/stops the singleton NetworkMonitor and exposes
// reactive state for components to render network indicators.
// ─────────────────────────────────────────────────────────────────

export function useNetworkMonitor() {
  const network = useNetworkStore();
  const ui      = useUIStore();

  // ── Lifecycle ─────────────────────────────────────────────────

  useEffect(() => {
    networkMonitor.start();
    return () => networkMonitor.stop();
  }, []);

  // ── Show/hide network banner ──────────────────────────────────

  useEffect(() => {
    if (network.mode === "offline") {
      ui.setShowNetworkBanner(true);
    } else if (network.mode === "strong") {
      const timer = setTimeout(() => ui.setShowNetworkBanner(false), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [network.mode]);

  // ── Manual force probe ────────────────────────────────────────

  const forceProbe = useCallback(async () => {
    await networkMonitor.forceProbe();
  }, []);

  // ── Derived state ─────────────────────────────────────────────

  const overlayColor = network.getOverlayColor();
  const shouldWarn   = network.avg_rtt + network.avg_ai_response_ms > 3000;
  const qualityLabel = getQualityLabel(network.mode, network.avg_rtt);

  return {
    // State
    mode:              network.mode,
    rttMs:             network.rtt_ms,
    avgRTT:            network.avg_rtt,
    avgAIResponseMs:   network.avg_ai_response_ms,
    modelOverride:     network.model_override,
    isOfflineFallback: network.is_offline_fallback_active,
    isProbing:         network.is_probing,
    probeCount:        network.probe_count,

    // Derived
    overlayColor,
    shouldWarn,
    qualityLabel,
    showBanner:        ui.show_network_banner,

    // Actions
    forceProbe,
    dismissBanner:     () => ui.setShowNetworkBanner(false),
    getEffectiveModel: network.getEffectiveModel,
  };
}

// ─────────────────────────────────────────────────────────────────
// Lightweight version — just for overlay dot color
// ─────────────────────────────────────────────────────────────────

export function useNetworkColor(): "green" | "yellow" | "red" {
  const { mode } = useNetworkStore();
  if (mode === "strong")   return "green";
  if (mode === "degraded") return "yellow";
  return "red";
}

// ─────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────

function getQualityLabel(
  mode: string,
  avgRTT: number
): string {
  if (mode === "offline") return "Offline";
  if (avgRTT < 200)       return "Excellent";
  if (avgRTT < 500)       return "Good";
  if (avgRTT < 800)       return "Fair";
  if (avgRTT < 2000)      return "Poor";
  return "Very Poor";
}
