/**
 * Mock-session hint surface — works without overlay mounted.
 * Overlay store syncs when the user opts in to the floating panel.
 */
import { create } from "zustand";

export type MockHintState = "idle" | "generating" | "ready" | "error";

type MockHintBridgeState = {
  hintText: string;
  hintState: MockHintState;
  hintError: string | null;
  streamingText: string;
  setHintState: (state: MockHintState) => void;
  setHintError: (error: string | null) => void;
  setStreamingText: (text: string) => void;
  appendStreamingChunk: (chunk: string) => void;
  commitHint: (text: string) => void;
  reset: () => void;
};

export const useMockHintBridge = create<MockHintBridgeState>((set, get) => ({
  hintText: "",
  hintState: "idle",
  hintError: null,
  streamingText: "",
  setHintState: (hintState) => set({ hintState }),
  setHintError: (hintError) => set({ hintError }),
  setStreamingText: (streamingText) => set({ streamingText }),
  appendStreamingChunk: (chunk) =>
    set({ streamingText: get().streamingText + chunk }),
  commitHint: (text) =>
    set({ hintText: text, streamingText: "", hintState: "ready", hintError: null }),
  reset: () =>
    set({
      hintText: "",
      hintState: "idle",
      hintError: null,
      streamingText: "",
    }),
}));

/** Mirror mock hint state into overlay when the optional panel is open. */
export function syncMockHintToOverlay(overlayOpen: boolean): void {
  if (!overlayOpen) return;
  // Lazy import avoids circular deps with overlay store at module load.
  void import("@/store/overlayStore").then(({ useOverlayStore }) => {
    const bridge = useMockHintBridge.getState();
    const overlay = useOverlayStore.getState();
    if (bridge.hintState === "generating") {
      overlay.setHintState("generating");
    } else if (bridge.hintState === "ready" && bridge.hintText) {
      overlay.setHintState("ready");
      overlay.setOfflineFallback(null);
      overlay.setError(bridge.hintError);
    } else if (bridge.hintState === "error") {
      overlay.setHintState("idle");
      overlay.setError(bridge.hintError);
    }
  });
}
