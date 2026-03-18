import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";

// ─────────────────────────────────────────────────────────────────
// LiveOverlay
// Minimal page that just mounts the overlay and keyboard handler.
// Used when the user wants overlay-only mode with no page UI.
// ─────────────────────────────────────────────────────────────────

export default function LiveOverlay() {
  return (
    <>
      <OverlayWindow />
      <OverlayKeyboardHandler enabled={true} />
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">Overlay Mode Active</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            The overlay is floating on your screen. Use <kbd className="hotkey-badge">⌃⇧H</kbd> to toggle visibility.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Press <kbd className="hotkey-badge">⌃⇧P</kbd> for panic mode
          </p>
        </div>
      </div>
    </>
  );
}
