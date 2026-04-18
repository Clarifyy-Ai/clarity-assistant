import { useEffect, useRef } from "react";
import { hotkeyManager, type HotkeyDefinition } from "@/lib/overlay/hotkeys";

// Parse "ctrl+shift+h" / ["ctrl","shift","h"] into a normalized Set
function parseCombo(combo: string | string[]): string[] {
  const parts = Array.isArray(combo)
    ? combo
    : combo.split("+").map((p) => p.trim());
  return parts.map((p) => p.toLowerCase());
}

function matches(e: KeyboardEvent, keys: string[]): boolean {
  const pressed = new Set<string>();
  if (e.ctrlKey || e.metaKey) pressed.add("ctrl");
  if (e.shiftKey) pressed.add("shift");
  if (e.altKey) pressed.add("alt");
  pressed.add((e.key || "").toLowerCase());
  if (pressed.size !== keys.length) return false;
  return keys.every((k) => pressed.has(k));
}

/**
 * useHotkeys — accepts a handlers map keyed by combo strings ("ctrl+shift+h")
 * AND registers the global hotkey manager (overlay-wide shortcuts).
 * Per-component handlers run BEFORE global ones and stopPropagation if matched.
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
    if (!enabled) {
      hotkeyManager.unregister();
      return;
    }
    hotkeyManager.register();

    function onKeyDown(e: KeyboardEvent) {
      const map = handlersRef.current;
      if (!map) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      for (const combo of Object.keys(map)) {
        if (matches(e, parseCombo(combo))) {
          e.preventDefault();
          e.stopPropagation();
          try { map[combo](); } catch (err) { console.error("[useHotkeys]", err); }
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      hotkeyManager.unregister();
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

      const pressed = new Set<string>();
      if (e.ctrlKey || e.metaKey) pressed.add("ctrl");
      if (e.shiftKey) pressed.add("shift");
      if (e.altKey) pressed.add("alt");
      pressed.add(e.key.toLowerCase());

      if (pressed.size === keys.length && keys.every(k => pressed.has(k.toLowerCase()))) {
        e.preventDefault();
        handlerRef.current();
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [keys, enabled]);
}
