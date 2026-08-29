// src/components/overlay/OverlayKeyboardHandler.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useHotkey } from "@/hooks/useHotkeys";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { PANIC_RESPONSE } from "@/types/session.types";
import {
  comboToKeyArray,
  getEffectiveHotkeyCombo,
  loadHotkeyOverrides,
  type HotkeyOverrides,
} from "@/lib/overlay/hotkeyOverrides";
import type { HotkeyId } from "@/lib/constants/hotkeys";

interface OverlayKeyboardHandlerProps {
  enabled: boolean;
  onToggleMute?: () => void;
  onCaptureCoding?: () => void;
  onGenerate?: () => void;
}

function useHotkeyOverridesState(): HotkeyOverrides {
  const [overrides, setOverrides] = useState<HotkeyOverrides>(() => loadHotkeyOverrides());
  useEffect(() => {
    const onChange = () => setOverrides(loadHotkeyOverrides());
    window.addEventListener("clarify:hotkeys-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("clarify:hotkeys-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return overrides;
}

function keysFor(id: HotkeyId, overrides: HotkeyOverrides): string[] {
  return comboToKeyArray(getEffectiveHotkeyCombo(id, overrides));
}

export function OverlayKeyboardHandler({
  enabled,
  onToggleMute,
  onCaptureCoding,
  onGenerate,
}: OverlayKeyboardHandlerProps) {
  const is_visible = useOverlayStore((s) => s.is_visible);
  const is_panic_visible = useOverlayStore((s) => s.is_panic_visible);
  const hidePanic = useOverlayStore((s) => s.hidePanic);
  const clearHint = useOverlayStore((s) => s.clearHint);
  const cycleHintStyle = useOverlayStore((s) => s.cycleHintStyle);
  const sessionStatus = useSessionStore((s) => s.status);
  const overrides = useHotkeyOverridesState();

  const toggleKeys = useMemo(() => keysFor("TOGGLE_OVERLAY", overrides), [overrides]);
  const aliasKeys = useMemo(() => keysFor("TOGGLE_OVERLAY_ALIAS", overrides), [overrides]);
  const captureKeys = useMemo(() => keysFor("CAPTURE_CODING", overrides), [overrides]);
  const minimizeKeys = useMemo(() => keysFor("MINIMIZE_OVERLAY", overrides), [overrides]);
  const aiKeys = useMemo(() => keysFor("REQUEST_AI_ANSWER", overrides), [overrides]);
  const cycleKeys = useMemo(() => keysFor("CYCLE_HINT_STYLE", overrides), [overrides]);
  const panicKeys = useMemo(() => keysFor("PANIC_CALM", overrides), [overrides]);

  useHotkey(toggleKeys, () => useOverlayStore.getState().toggleMinimize(), enabled);
  useHotkey(aliasKeys, () => useOverlayStore.getState().toggleMinimize(), enabled);

  useHotkey(
    captureKeys,
    () => {
      if (sessionStatus === "active") onCaptureCoding?.();
    },
    enabled && is_visible && !!onCaptureCoding,
  );

  useHotkey(minimizeKeys, () => useOverlayStore.getState().toggleMinimize(), enabled);

  useHotkey(["ctrl", "shift", "t"], toggleAppStealthMode, enabled && is_visible);

  useHotkey(
    ["ctrl", "shift", "s"],
    () => {
      const el = document
        .getElementById("clarify-overlay-root")
        ?.querySelector<HTMLElement>(".scroll-container");
      el?.scrollBy({ top: -120, behavior: "smooth" });
    },
    enabled && is_visible,
  );

  useHotkey(
    ["ctrl", "shift", "d"],
    () => {
      const el = document
        .getElementById("clarify-overlay-root")
        ?.querySelector<HTMLElement>(".scroll-container");
      el?.scrollBy({ top: 120, behavior: "smooth" });
    },
    enabled && is_visible,
  );

  useHotkey(
    ["ctrl", "shift", "q"],
    () => useOverlayStore.getState().clearHint(),
    enabled && is_visible,
  );

  useHotkey(
    panicKeys,
    () => useOverlayStore.getState().showPanic(PANIC_RESPONSE),
    enabled,
  );

  useHotkey(
    ["escape"],
    () => {
      const os = useOverlayStore.getState();
      if (os.is_hotkey_help_visible) {
        os.setHotkeyHelpVisible(false);
      } else if (is_panic_visible) {
        hidePanic?.();
      } else {
        clearHint?.();
      }
    },
    enabled && is_visible,
  );

  useHotkey(cycleKeys, () => cycleHintStyle?.(), enabled && is_visible);

  useHotkey(["ctrl", "shift", "m"], () => onToggleMute?.(), enabled);

  useHotkey(aiKeys, () => onGenerate?.(), enabled && is_visible && !!onGenerate);

  useHotkey(
    ["ctrl", "1"],
    () => useOverlayStore.getState().setPosition({ x: 24, y: 80 }),
    enabled && is_visible,
  );
  useHotkey(
    ["ctrl", "2"],
    () =>
      useOverlayStore.getState().setPosition({
        x: window.innerWidth - 444,
        y: 80,
      }),
    enabled && is_visible,
  );
  useHotkey(
    ["ctrl", "3"],
    () =>
      useOverlayStore.getState().setPosition({
        x: 24,
        y: window.innerHeight - 560,
      }),
    enabled && is_visible,
  );
  useHotkey(
    ["ctrl", "4"],
    () =>
      useOverlayStore.getState().setPosition({
        x: window.innerWidth - 444,
        y: window.innerHeight - 560,
      }),
    enabled && is_visible,
  );

  useHotkey(
    ["ctrl", "shift", "escape"],
    () => {
      const os = useOverlayStore.getState();
      os.hideOverlay();
      os.resetSessionState();
    },
    enabled,
  );

  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync remapped global shortcuts into Electron main process.
  useEffect(() => {
    const api = (
      window as Window & {
        electronAPI?: {
          syncGlobalShortcuts?: (
            bindings: Array<{ accelerator: string; action: string }>,
          ) => Promise<void>;
        };
      }
    ).electronAPI;
    if (!api?.syncGlobalShortcuts) return;
    void import("@/lib/overlay/hotkeyOverrides").then((m) => {
      void api.syncGlobalShortcuts?.(m.buildElectronShortcutBindings(overrides));
    });
  }, [overrides]);

  useEffect(() => {
    if (!enabled) return;

    function onHotkeyHelp(e: KeyboardEvent) {
      if (
        e.ctrlKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        (e.key === "/" || e.key === "?")
      ) {
        e.preventDefault();
        const os = useOverlayStore.getState();
        if (os.is_visible) os.toggleHotkeyHelp();
      }
    }

    window.addEventListener("keydown", onHotkeyHelp, true);

    function clearPeekTimer() {
      if (peekTimerRef.current) {
        clearTimeout(peekTimerRef.current);
        peekTimerRef.current = null;
      }
    }

    let peekArmTimer: ReturnType<typeof setTimeout> | null = null;

    function clearPeekArm() {
      if (peekArmTimer) {
        clearTimeout(peekArmTimer);
        peekArmTimer = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Control" && e.key !== "Shift") {
        clearPeekArm();
        return;
      }

      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;

      const os = useOverlayStore.getState();
      if (os.is_peek_active) {
        clearPeekTimer();
        return;
      }

      if (!os.is_visible && !os.is_peek_active && !peekArmTimer) {
        peekArmTimer = setTimeout(() => {
          peekArmTimer = null;
          const cur = useOverlayStore.getState();
          if (!cur.is_visible && !cur.is_peek_active) {
            cur.setPeekActive(true);
          }
        }, 400);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== "Control" && e.key !== "Shift") return;
      clearPeekArm();
      const os = useOverlayStore.getState();
      if (!os.is_peek_active) return;
      clearPeekTimer();
      peekTimerRef.current = setTimeout(() => {
        const cur = useOverlayStore.getState();
        if (cur.is_peek_active) cur.setPeekActive(false);
        peekTimerRef.current = null;
      }, 2000);
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);

    return () => {
      window.removeEventListener("keydown", onHotkeyHelp, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      clearPeekTimer();
      clearPeekArm();
    };
  }, [
    enabled,
    is_panic_visible,
    hidePanic,
    clearHint,
    cycleHintStyle,
    onToggleMute,
    is_visible,
    sessionStatus,
  ]);

  return null;
}
