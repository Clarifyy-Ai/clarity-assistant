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
    const { mode: currentMode } = useOverlayStore.getState();
    if (currentMode !== undefined && mode !== "offline") return false;

    // Use getState() so the callback stays stable (no store object in dep array)
    const store = useOverlayStore.getState();
    const template =
      `Consider this question: "${questionText.slice(0, 100)}"\n\n` +
      `You're offline. Use the STAR framework:\nSituation → Task → Action → Result.`;
    store.setOfflineFallback?.(template);
    return mode === "offline";
  }, [mode]);

  return {
    isOffline,
    serveFallback,
  };
}
