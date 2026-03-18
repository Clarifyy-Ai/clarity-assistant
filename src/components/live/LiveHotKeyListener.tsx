import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";

// ─────────────────────────────────────────────────────────────────
// LiveHotKeyListener
// Thin wrapper that activates keyboard handlers during live session.
// ─────────────────────────────────────────────────────────────────

interface LiveHotKeyListenerProps {
  enabled: boolean;
  onToggleMute?: () => void;
}

export function LiveHotKeyListener({ enabled, onToggleMute }: LiveHotKeyListenerProps) {
  return <OverlayKeyboardHandler enabled={enabled} onToggleMute={onToggleMute} />;
}
