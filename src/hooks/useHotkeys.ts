import { useEffect, useRef } from "react";
import { hotkeyManager, type HotkeyDefinition } from "@/lib/overlay/hotkeys";

export function useHotkeys(_handlers?: Record<string, () => void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    hotkeyManager.register();
    return () => hotkeyManager.unregister();
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
