import { useCallback } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useHotkeys } from "./useHotkeys";
import { PANIC_RESPONSE } from "@/types/session.types";
import { toggleAppStealthMode, setAppStealthMode } from "@/lib/stealth/stealthActions";

// ─────────────────────────────────────────────────────────────────
// useOverlayVisibility
// Thin wrapper around overlayStore visibility actions
// with hotkey bindings wired in.
// ─────────────────────────────────────────────────────────────────

export function useOverlayVisibility(enabled = true) {
  // Individual selectors — reactive state returned to callers
  const is_visible       = useOverlayStore((s) => s.is_visible);
  const is_stealth_mode  = useOverlayStore((s) => s.is_stealth_mode);
  const is_panic_visible = useOverlayStore((s) => s.is_panic_visible);
  const position         = useOverlayStore((s) => s.position);

  // Hotkey callbacks use .getState() — reads current value at call time,
  // avoiding stale closure issues when the callbacks are long-lived
  useHotkeys(
    {
      toggle_overlay: () => {
        const s = useOverlayStore.getState();
        s.is_visible ? s.hideOverlay() : s.showOverlay();
      },
      stealth_mode: toggleAppStealthMode,
      panic:      () => useOverlayStore.getState().showPanic(PANIC_RESPONSE),
      clear_hint: () => useOverlayStore.getState().clearHint(),
    },
    enabled
  );

  // Stable action callbacks — .getState() inside body, empty dep array
  const show   = useCallback(() => useOverlayStore.getState().showOverlay(),  []);
  const hide   = useCallback(() => useOverlayStore.getState().hideOverlay(),  []);
  const toggle = useCallback(() => {
    const s = useOverlayStore.getState();
    s.is_visible ? s.hideOverlay() : s.showOverlay();
  }, []);

  return {
    isVisible:   is_visible,
    isStealth:   is_stealth_mode,
    isPanic:     is_panic_visible,
    position,
    show,
    hide,
    toggle,
    setPosition: useOverlayStore.getState().setPosition,
    setStealth:  setAppStealthMode,
    showPanic:   useOverlayStore.getState().showPanic,
    hidePanic:   useOverlayStore.getState().hidePanic,
  };
}
