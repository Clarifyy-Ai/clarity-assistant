import { useCallback } from "react";
import { useNetworkMonitor } from "./useNetworkMonitor";
import { useOverlayStore } from "@/store/overlayStore";

// ─────────────────────────────────────────────────────────────────
// useOfflineFallback
// When network = "offline", immediately serve a template answer
// instead of waiting for the AI to time out.
// ─────────────────────────────────────────────────────────────────

export function useOfflineFallback() {
  const { mode } = useNetworkMonitor();
  const isOffline = mode === "offline";

  const serveFallback = useCallback((questionText: string): boolean => {
    const storeState = useOverlayStore.getState() as { mode?: string; setOfflineFallback?: (text: string) => void };
    if (storeState.mode !== undefined && mode !== "offline") return false;

    const template =
      `Consider this question: "${questionText.slice(0, 100)}"\n\n` +
      `You're offline. Use the STAR framework:\nSituation → Task → Action → Result.`;
    storeState.setOfflineFallback?.(template);
    return mode === "offline";
  }, [mode]);

  return {
    isOffline,
    serveFallback,
  };
}
