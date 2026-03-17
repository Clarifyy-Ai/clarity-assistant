import { useEffect, useCallback, useRef } from "react";
import {
  HOTKEY_MAP,
  parseHotkeyCombo,
  matchesCombo,
  type HotkeyAction,
} from "@/lib/overlay/hotkeys";
import { useOverlayStore } from "@/store/overlayStore";

// ─────────────────────────────────────────────────────────────────
// useHotkeys
// Global keyboard listener that maps Ctrl+Shift combos
// to overlay actions. Fires regardless of focused element.
// ─────────────────────────────────────────────────────────────────

type HotkeyHandler = Partial<Record<HotkeyAction, () => void>>;

export function useHotkeys(handlers: HotkeyHandler, enabled = true) {
  const overlayStore  = useOverlayStore();
  const handlersRef   = useRef(handlers);

  // Keep handlers ref fresh without re-attaching listener
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      // Never fire inside an input / textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      for (const [action, combo] of Object.entries(HOTKEY_MAP)) {
        if (matchesCombo(e, combo)) {
          e.preventDefault();
          e.stopPropagation();

          const handler = handlersRef.current[action as HotkeyAction];
          if (handler) {
            handler();
          } else {
            // Default overlay behaviours
            executeDefault(action as HotkeyAction, overlayStore);
          }
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [enabled, overlayStore]);
}

function executeDefault(action: HotkeyAction, store: ReturnType<typeof useOverlayStore>) {
  switch (action) {
    case "toggle_overlay":
      store.is_visible ? store.hideOverlay() : store.showOverlay();
      break;
    case "stealth_mode":
      store.setStealthMode(!store.is_stealth_mode);
      break;
    case "panic":
      store.showPanic();
      break;
    case "clear_hint":
      store.clearHint();
      break;
    case "shorter_hint":
      store.requestShorter();
      break;
    case "next_hint":
      store.requestNext();
      break;
  }
}

// ── Convenience: single-action hotkey hook ────────────────────────

export function useHotkey(
  keys: string[],
  handler: () => void,
  enabled = true
) {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const combo = parseHotkeyCombo(keys);
      if (matchesCombo(e, combo)) {
        e.preventDefault();
        handlerRef.current();
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [keys, enabled]);
}
