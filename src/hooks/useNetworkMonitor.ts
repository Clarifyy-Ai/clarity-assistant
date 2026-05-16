import { useEffect, useCallback, useMemo } from "react";
import { useNetworkStore } from "@/store/networkStore";
import { useUIStore } from "@/store/uiStore";
import { networkMonitor } from "@/lib/network/networkMonitor";

export function useNetworkMonitor() {
  const network = useNetworkStore();
  const ui = useUIStore();

  // ✅ Start once safely
  useEffect(() => {
    networkMonitor.start();
    return () => networkMonitor.stop();
  }, []);

  // ✅ Banner handling (no flicker)
  useEffect(() => {
    if (network.mode === "offline") {
      ui.setShowNetworkBanner(true);
    } else if (network.mode === "strong") {
      const t = setTimeout(() => ui.setShowNetworkBanner(false), 3000);
      return () => clearTimeout(t);
    }
  }, [network.mode]);

  const forceProbe = useCallback(async () => {
    await networkMonitor.forceProbe();
  }, []);

  // ✅ Memo derived data (no jitter)
  const overlayColor = useMemo(() => network.getOverlayColor(), [network.mode]);

  const qualityLabel = useMemo(
    () => getQualityLabel(network.mode, network.avg_rtt),
    [network.mode, network.avg_rtt]
  );

  const shouldWarn = useMemo(
    () => network.avg_rtt + network.avg_ai_response_ms > 3000,
    [network.avg_rtt, network.avg_ai_response_ms]
  );

  return {
    mode: network.mode,
    rttMs: network.rtt_ms,
    avgRTT: network.avg_rtt,
    avgAIResponseMs: network.avg_ai_response_ms,

    overlayColor,
    qualityLabel,
    shouldWarn,

    showBanner: ui.show_network_banner,

    forceProbe,
    dismissBanner: () => ui.setShowNetworkBanner(false),
    getEffectiveModel: network.getEffectiveModel,
  };
}

export function useNetworkColor(): "green" | "yellow" | "red" {
  const mode = useNetworkStore((s) => s.mode);
  if (mode === "strong") return "green";
  if (mode === "degraded") return "yellow";
  return "red";
}

function getQualityLabel(mode: string, avgRTT: number): string {
  if (mode === "offline") return "Offline";
  if (avgRTT < 200) return "Excellent";
  if (avgRTT < 500) return "Good";
  if (avgRTT < 800) return "Fair";
  if (avgRTT < 2000) return "Poor";
  return "Very Poor";
}
