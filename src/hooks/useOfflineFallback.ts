import { useCallback } from "react";
import { useNetworkMonitor } from "./useNetworkMonitor";
import { getOfflineTemplate } from "@/lib/ai/offlineTemplateEngine";
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

    const template = getOfflineTemplate(questionText);
    overlayStore.setCurrentHintText(template);
    overlayStore.setHintState("offline");
    return true;
  }, [mode]);

  return {
    isOffline,
    serveFallback,
  };
}
