// src/components/overlay/OverlayKeyboardHandler.tsx — PRODUCTION READY
import { useEffect, useRef } from "react";
import { useHotkey } from "@/hooks/useHotkeys";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { PANIC_RESPONSE } from "@/types/session.types";
import { captureAndAnalyseCodingProblem } from "@/lib/audio/screenshotCapture";

interface OverlayKeyboardHandlerProps {
  enabled: boolean;
  onToggleMute?: () => void;
}

export function OverlayKeyboardHandler({ enabled, onToggleMute }: OverlayKeyboardHandlerProps) {
  const is_visible = useOverlayStore((s) => s.is_visible);
  const is_panic_visible = useOverlayStore((s) => s.is_panic_visible);
  const hidePanic = useOverlayStore((s) => s.hidePanic);
  const clearHint = useOverlayStore((s) => s.clearHint);
  const cycleHintStyle = useOverlayStore((s) => s.cycleHintStyle);
  const sessionStatus = useSessionStore((s) => s.status);

  // ✅ Ctrl+Shift+H: Smart toggle (restores from minimize/peek correctly)
  useHotkey(
    ["ctrl", "shift", "h"],
    () => {
      const os = useOverlayStore.getState();
      // toggleMinimize handles:
      // - visible -> minimize(peek)
      // - peek -> restore
      // - hidden -> show
      os.toggleMinimize();
    },
    enabled
  );

  // ✅ Ctrl+Shift+J: explicit minimize/restore
  useHotkey(
    ["ctrl", "shift", "j"],
    () => {
      useOverlayStore.getState().toggleMinimize();
    },
    enabled
  );

  useHotkey(["ctrl", "shift", "s"], toggleAppStealthMode, enabled && is_visible);

  useHotkey(["ctrl", "shift", "p"], () => {
    useOverlayStore.getState().showPanic(PANIC_RESPONSE);
  }, enabled);

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
    enabled && is_visible
  );

  useHotkey(["ctrl", "shift", "y"], () => cycleHintStyle?.(), enabled && is_visible);

  useHotkey(
    ["ctrl", "shift", "c"],
    () => {
      if (sessionStatus === "active") captureAndAnalyseCodingProblem();
    },
    enabled && is_visible
  );

  useHotkey(["ctrl", "shift", "m"], () => onToggleMute?.(), enabled);

  // Quick dock positions
  useHotkey(["ctrl", "1"], () => useOverlayStore.getState().setPosition({ x: 24, y: 80 }), enabled && is_visible);
  useHotkey(["ctrl", "2"], () => useOverlayStore.getState().setPosition({ x: window.innerWidth - 444, y: 80 }), enabled && is_visible);
  useHotkey(["ctrl", "3"], () => useOverlayStore.getState().setPosition({ x: 24, y: window.innerHeight - 560 }), enabled && is_visible);
  useHotkey(["ctrl", "4"], () => useOverlayStore.getState().setPosition({ x: window.innerWidth - 444, y: window.innerHeight - 560 }), enabled && is_visible);

  // Emergency exit
  useHotkey(["ctrl", "shift", "escape"], () => {
    const os = useOverlayStore.getState();
    os.hideOverlay();
    os.resetSessionState();
  }, enabled);

  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function onHotkeyHelp(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.key === "/" || e.key === "?")) {
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

    // Hold Ctrl+Shift to show a temporary peek pill (WITHOUT turning overlay visible)
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Control" && e.key !== "Shift") {
        clearPeekArm();
        return;
      }

      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;

      const os = useOverlayStore.getState();

      // already peeking
      if (os.is_peek_active) {
        clearPeekTimer();
        return;
      }

      // arm peek after short hold
      if (!os.is_visible && !os.is_peek_active && !peekArmTimer) {
        peekArmTimer = setTimeout(() => {
          peekArmTimer = null;
          const cur = useOverlayStore.getState();
          if (!cur.is_visible && !cur.is_peek_active) {
            // ✅ FIX: do NOT call showOverlay() (it clears peek)
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
        if (cur.is_peek_active) {
          // ✅ FIX: just disable peek; don't call hideOverlay() (not needed)
          cur.setPeekActive(false);
        }
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
  }, [enabled, is_panic_visible, hidePanic, clearHint, cycleHintStyle, onToggleMute, is_visible, sessionStatus]);

  return null;
}
