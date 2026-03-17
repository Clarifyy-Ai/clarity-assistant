import { useCallback } from "react";
import { useNetworkMonitor } from "./useNetworkMonitor";
import { useOverlayStore } from "@/store/overlayStore";

// ─────────────────────────────────────────────────────────────────
// useOfflineFallback
// When network = "offline", immediately serve a template answer
// instead of waiting for the AI to time out.
// ─────────────────────────────────────────────────────────────────

export function useOfflineFallback() {
  const { mode }    = useNetworkMonitor();
  const overlayStore = useOverlayStore();

  const isOffline = mode === "offline";

  const serveFallback = useCallback((questionText: string): boolean => {
    if (mode !== "offline") return false;

    const template = `Consider this question: "${questionText.slice(0, 100)}"\n\nYou're offline. Use the STAR framework: Situation → Task → Action → Result.`;
    overlayStore.setOfflineFallback(template);
    return true;
  }, [mode]);

  return {
    isOffline,
    serveFallback,
  };
}
