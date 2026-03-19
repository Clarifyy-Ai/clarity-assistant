import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useOverlayStore } from "@/store/overlayStore";
import { useStealthMouse } from "@/hooks/useStealthMouse";
import { OverlayHintPanel } from "./OverlayHintPanel";
import { OverlayQuestionBar } from "./OverlayQuestionBar";
import { OverlayNetworkBadge } from "./OverlayNetworkBadge";
import { StealthMouseGuard } from "./StealthMouseGuard";
import { OverlayPositionManager } from "./OverlayPositionManager";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// OverlayWindow
// Invisible floating overlay panel rendered via a portal into
// #overlay-root — separate compositor layer from screen capture.
// ─────────────────────────────────────────────────────────────────

export function OverlayWindow() {
  // Guard for non-DOM contexts (SSR/hydration)
  const overlayRootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      overlayRootRef.current = document.getElementById("overlay-root") as HTMLElement | null;
    }
  }, []);

  const panelRef = useRef<HTMLDivElement>(null);

  const {
    is_visible,
    is_stealth_mode,
    is_proctor_safe,
    is_panic_visible,
    panic_content,
    position,
    current_question,
    current_hint,
    streaming_buffer,
    hint_state,
    hint_style,
    network_color,
    error_message,
    screenshot_hint,
    is_screenshot_loading,
    setPosition,
  } = useOverlayStore();

  // Attach stealth mouse behavior to the panel
  useStealthMouse(panelRef, is_stealth_mode);

  // If root is missing or overlay is hidden, render nothing
  if (!overlayRootRef.current || !is_visible) return null;

  const displayText = hint_state === "streaming" ? streaming_buffer : current_hint;

  return createPortal(
    <StealthMouseGuard isActive={is_stealth_mode}>
      <OverlayPositionManager
        ref={panelRef}
        position={position}
        onPositionChange={setPosition}
        isProctorSafe={is_proctor_safe}
      >
        <div
          className={cn(
            "overlay-panel no-select flex max-h-[520px] w-[420px] flex-col gap-0 transition-opacity duration-150",
            is_stealth_mode && "opacity-90"
          )}
          // Prevent accidental interactions in stealth
          style={{ pointerEvents: is_stealth_mode ? "none" : "auto" }}
          role="dialog"
          aria-label="ConfideQ Overlay"
        >
          {/* Top bar / drag handle */}
          <div
            data-drag-handle
            className="flex cursor-grab items-center justify-between border-b border-white/5 px-4 py-2 active:cursor-grabbing"
            title="Drag to move"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-300/60">
                ConfideQ
              </span>
              <OverlayNetworkBadge color={network_color} />
            </div>
            <div className="flex items-center gap-1">
              {is_stealth_mode && (
                <span className="font-mono text-[9px] text-brand-400/50">STEALTH</span>
              )}
              {is_proctor_safe && (
                <span className="font-mono text-[9px] text-success/50">SAFE</span>
              )}
            </div>
          </div>

          {/* Panic overlay (blocking) */}
          {is_panic_visible && panic_content && (
            <div className="animate-fade-in border-b border-warning/20 bg-warning/10 px-4 py-3">
              <p className="mb-2 text-xs font-semibold text-warning">🆘 Breathe</p>
              <ol className="space-y-1.5 text-xs text-overlay-text">
                <li>1. {panic_content.step_1}</li>
                <li>2. {panic_content.step_2}</li>
                <li>3. {panic_content.step_3}</li>
              </ol>
            </div>
          )}

          {/* Question bar (hidden during panic) */}
          {current_question && !is_panic_visible && (
            <OverlayQuestionBar question={current_question} />
          )}

          {/* Hint panel (hidden during panic) */}
          {!is_panic_visible && (
            <OverlayHintPanel
              text={displayText}
              hintStyle={hint_style}
              hintState={hint_state}
              errorMessage={error_message}
              screenshotHint={screenshot_hint}
              isScreenshotLoading={is_screenshot_loading}
            />
          )}

          {/* Bottom status bar */}
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-1.5 font-mono text-[9px] text-muted-foreground/40">
            <span>⌃⇧H hide · Esc clear · ⌃⇧P panic</span>
            <span className="capitalize">{hint_style.replace("_", " ")}</span>
          </div>
        </div>
      </OverlayPositionManager>
    </StealthMouseGuard>,
    overlayRootRef.current
  );
}
``
