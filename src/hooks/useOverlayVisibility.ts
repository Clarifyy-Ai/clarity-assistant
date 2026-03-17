import { useCallback } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useHotkeys } from "./useHotkeys";

// ─────────────────────────────────────────────────────────────────
// useOverlayVisibility
// Thin wrapper around overlayStore visibility actions
// with hotkey bindings wired in.
// ─────────────────────────────────────────────────────────────────

export function useOverlayVisibility(enabled = true) {
  const store = useOverlayStore();

  useHotkeys(
    {
      toggle_overlay: () => store.is_visible ? store.hideOverlay() : store.showOverlay(),
      stealth_mode:   () => store.setStealthMode(!store.is_stealth_mode),
      panic:          () => store.showPanic(),
      clear_hint:     () => store.clearHint(),
    },
    enabled
  );

  const show = useCallback(() => store.showOverlay(), [store]);
  const hide = useCallback(() => store.hideOverlay(), [store]);
  const toggle = useCallback(() => {
    store.is_visible ? store.hideOverlay() : store.showOverlay();
  }, [store]);

  return {
    isVisible:    store.is_visible,
    isStealth:    store.is_stealth_mode,
    isPanic:      store.is_panic_visible,
    position:     store.position,
    show,
    hide,
    toggle,
    setPosition:  store.setPosition,
    setStealth:   store.setStealthMode,
    showPanic:    store.showPanic,
    hidePanic:    store.hidePanic,
  };
}
