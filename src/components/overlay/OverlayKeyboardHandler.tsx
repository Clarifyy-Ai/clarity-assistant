import { useEffect, useRef } from 'react';
import { useHotkey } from '@/hooks/useHotkeys';
import { useOverlayStore } from '@/store/overlayStore';
import { useSessionStore } from '@/store/sessionStore';
import { toggleAppStealthMode } from '@/lib/stealth/stealthActions';
import { PANIC_RESPONSE } from '@/types/session.types';
import { captureAndAnalyseCodingProblem } from '@/lib/audio/screenshotCapture';

interface OverlayKeyboardHandlerProps {
  enabled: boolean;
  onToggleMute?: () => void;
}

export function OverlayKeyboardHandler({
  enabled,
  onToggleMute,
}: OverlayKeyboardHandlerProps) {
  const toggleOverlay    = useOverlayStore((s) => s.toggleOverlay);
  const is_visible       = useOverlayStore((s) => s.is_visible);
  const is_panic_visible = useOverlayStore((s) => s.is_panic_visible);
  const showPanic        = useOverlayStore((s) => s.showPanic);
  const hidePanic        = useOverlayStore((s) => s.hidePanic);
  const clearHint        = useOverlayStore((s) => s.clearHint);
  const cycleHintStyle   = useOverlayStore((s) => s.cycleHintStyle);
  const sessionStatus    = useSessionStore((s) => s.status);

  useHotkey(['ctrl', 'shift', 'h'], () => { toggleOverlay?.(); }, enabled);

  useHotkey(['ctrl', 'shift', 's'], toggleAppStealthMode, enabled && is_visible);

  useHotkey(['ctrl', 'shift', 'p'], () => { showPanic?.(PANIC_RESPONSE); }, enabled);

  useHotkey(
    ['escape'],
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

  useHotkey(['ctrl', 'shift', 'y'], () => { cycleHintStyle?.(); }, enabled && is_visible);

  useHotkey(
    ['ctrl', 'shift', 'c'],
    () => { if (sessionStatus === 'active') captureAndAnalyseCodingProblem(); },
    enabled && is_visible
  );

  useHotkey(['ctrl', 'shift', 'm'], () => { onToggleMute?.(); }, enabled);

  // ── Quick Dock Positions ──────────────────────────────────────
  useHotkey(['ctrl', '1'], () => {
    useOverlayStore.getState().setPosition({ x: 24, y: 80 });
  }, enabled && is_visible);

  useHotkey(['ctrl', '2'], () => {
    useOverlayStore.getState().setPosition({ x: window.innerWidth - 444, y: 80 });
  }, enabled && is_visible);

  useHotkey(['ctrl', '3'], () => {
    useOverlayStore.getState().setPosition({ x: 24, y: window.innerHeight - 560 });
  }, enabled && is_visible);

  useHotkey(['ctrl', '4'], () => {
    useOverlayStore.getState().setPosition({ x: window.innerWidth - 444, y: window.innerHeight - 560 });
  }, enabled && is_visible);

  // ── Safe Word / Emergency Exit ────────────────────────────────
  useHotkey(['ctrl', 'shift', 'escape'], () => {
    const os = useOverlayStore.getState();
    os.hideOverlay();
    os.resetSessionState();
  }, enabled);

  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function onHotkeyHelp(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        const os = useOverlayStore.getState();
        if (os.is_visible) {
          os.toggleHotkeyHelp();
        }
      }
    }
    window.addEventListener('keydown', onHotkeyHelp, true);

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
      if (e.key !== 'Control' && e.key !== 'Shift') {
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
          const current = useOverlayStore.getState();
          if (!current.is_visible && !current.is_peek_active) {
            current.setPeekActive(true);
            current.showOverlay();
          }
        }, 400);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== 'Control' && e.key !== 'Shift') return;

      clearPeekArm();

      const os = useOverlayStore.getState();
      if (!os.is_peek_active) return;

      clearPeekTimer();
      peekTimerRef.current = setTimeout(() => {
        const current = useOverlayStore.getState();
        if (current.is_peek_active) {
          current.setPeekActive(false);
          current.hideOverlay();
        }
        peekTimerRef.current = null;
      }, 2000);
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);

    return () => {
      window.removeEventListener('keydown', onHotkeyHelp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      clearPeekTimer();
      clearPeekArm();
    };
  }, [enabled]);

  return null;
}
