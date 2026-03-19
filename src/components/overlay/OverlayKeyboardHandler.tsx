import { useHotkey } from '@/hooks/useHotkeys';
import { useOverlayStore } from '@/store/overlayStore';
import { useSessionStore } from '@/store/sessionStore';
import { PANIC_RESPONSE } from '@/types/session.types';
import { captureAndAnalyseCodingProblem } from '@/lib/audio/screenshotCapture';

// ────────────────────���────────────────────────────────────────────
// OverlayKeyboardHandler
// Handles keyboard shortcuts for the overlay. Renders nothing.
// ─────────────────────────────────────────────────────────────────

interface OverlayKeyboardHandlerProps {
  enabled: boolean;
  onToggleMute?: () => void;
}

export function OverlayKeyboardHandler({
  enabled,
  onToggleMute,
}: OverlayKeyboardHandlerProps) {
  const overlay = useOverlayStore();
  const session = useSessionStore();

  // Toggle overlay: Ctrl+Shift+H
  useHotkey(
    ['ctrl', 'shift', 'h'],
    () => {
      overlay.toggleOverlay?.();
    },
    enabled
  );

  // Stealth mode: Ctrl+Shift+S
  useHotkey(
    ['ctrl', 'shift', 's'],
    () => {
      overlay.setStealthMode?.(!overlay.is_stealth_mode);
    },
    enabled && overlay.is_visible
  );

  // Panic: Ctrl+Shift+P
  useHotkey(
    ['ctrl', 'shift', 'p'],
    () => {
      overlay.showPanic?.(PANIC_RESPONSE);
    },
    enabled
  );

  // Clear hint or hide panic: Escape
  useHotkey(
    ['escape'],
    () => {
      if (overlay.is_panic_visible) {
        overlay.hidePanic?.();
      } else {
        overlay.clearHint?.();
      }
    },
    enabled && overlay.is_visible
  );

  // Cycle hint style: Ctrl+Shift+Y
  useHotkey(
    ['ctrl', 'shift', 'y'],
    () => {
      overlay.cycleHintStyle?.();
    },
    enabled && overlay.is_visible
  );

  // Coding screenshot: Ctrl+Shift+C
  useHotkey(
    ['ctrl', 'shift', 'c'],
    () => {
      if (session.status === 'active') {
        captureAndAnalyseCodingProblem();
      }
    },
    enabled && overlay.is_visible
  );

  // Mute: Ctrl+Shift+M
  useHotkey(
    ['ctrl', 'shift', 'm'],
    () => {
      onToggleMute?.();
    },
    enabled
  );

  return null;
}
