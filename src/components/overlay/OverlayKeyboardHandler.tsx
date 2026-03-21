import { useHotkey } from '@/hooks/useHotkeys';
import { useOverlayStore } from '@/store/overlayStore';
import { useSessionStore } from '@/store/sessionStore';
import { PANIC_RESPONSE } from '@/types/session.types';
import { captureAndAnalyseCodingProblem } from '@/lib/audio/screenshotCapture';

// ─────────────────────────────────────────────────────────────────
// OverlayKeyboardHandler
// Handles keyboard shortcuts for the overlay. Renders nothing.
// Uses individual selectors — never the full store object — so
// this component only re-renders when the specific field it needs
// actually changes.
// ─────────────────────────────────────────────────────────────────

interface OverlayKeyboardHandlerProps {
  enabled: boolean;
  onToggleMute?: () => void;
}

export function OverlayKeyboardHandler({
  enabled,
  onToggleMute,
}: OverlayKeyboardHandlerProps) {
  // Individual selectors — stable, minimal re-renders
  const toggleOverlay    = useOverlayStore((s) => s.toggleOverlay);
  const is_visible       = useOverlayStore((s) => s.is_visible);
  const is_stealth_mode  = useOverlayStore((s) => s.is_stealth_mode);
  const setStealthMode   = useOverlayStore((s) => s.setStealthMode);
  const is_panic_visible = useOverlayStore((s) => s.is_panic_visible);
  const showPanic        = useOverlayStore((s) => s.showPanic);
  const hidePanic        = useOverlayStore((s) => s.hidePanic);
  const clearHint        = useOverlayStore((s) => s.clearHint);
  const cycleHintStyle   = useOverlayStore((s) => s.cycleHintStyle);
  const sessionStatus    = useSessionStore((s) => s.status);

  // Toggle overlay: Ctrl+Shift+H
  useHotkey(
    ['ctrl', 'shift', 'h'],
    () => { toggleOverlay?.(); },
    enabled
  );

  // Stealth mode: Ctrl+Shift+S
  useHotkey(
    ['ctrl', 'shift', 's'],
    () => { setStealthMode?.(!is_stealth_mode); },
    enabled && is_visible
  );

  // Panic: Ctrl+Shift+P
  useHotkey(
    ['ctrl', 'shift', 'p'],
    () => { showPanic?.(PANIC_RESPONSE); },
    enabled
  );

  // Clear hint or hide panic: Escape
  useHotkey(
    ['escape'],
    () => {
      if (is_panic_visible) {
        hidePanic?.();
      } else {
        clearHint?.();
      }
    },
    enabled && is_visible
  );

  // Cycle hint style: Ctrl+Shift+Y
  useHotkey(
    ['ctrl', 'shift', 'y'],
    () => { cycleHintStyle?.(); },
    enabled && is_visible
  );

  // Coding screenshot: Ctrl+Shift+C
  useHotkey(
    ['ctrl', 'shift', 'c'],
    () => {
      if (sessionStatus === 'active') {
        captureAndAnalyseCodingProblem();
      }
    },
    enabled && is_visible
  );

  // Mute: Ctrl+Shift+M
  useHotkey(
    ['ctrl', 'shift', 'm'],
    () => { onToggleMute?.(); },
    enabled
  );

  return null;
}
