import { useEffect, useRef } from "react";
import { eventMatchesKeys } from "@/lib/overlay/hotkeyMatch";

function parseCombo(combo: string | string[]): string[] {
  const parts = Array.isArray(combo)
    ? combo
    : combo.split("+").map((p) => p.trim());
  return parts.map((p) => p.toLowerCase());
}

/**
 * Per-component shortcut map keyed by combo strings ("ctrl+shift+h").
 * Overlay-wide shortcuts are handled by OverlayKeyboardHandler — this hook
 * must not also register HotkeyManager or Ctrl+Shift+H fires twice and cancels.
 */
export function useHotkeys(
  handlers?: Record<string, () => void>,
  enabled = true,
) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const map = handlersRef.current;
      if (!map) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      for (const combo of Object.keys(map)) {
        if (eventMatchesKeys(e, parseCombo(combo))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          try {
            map[combo]();
          } catch (err) {
            console.error("[useHotkeys]", err);
          }
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [enabled]);
}

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

      if (eventMatchesKeys(e, keys)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handlerRef.current();
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [keys, enabled]);
}
