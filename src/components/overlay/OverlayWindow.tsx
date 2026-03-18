import { useRef, useEffect } from "react";
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
// The invisible floating overlay panel rendered via portal into
// #overlay-root — separate compositor layer from screen capture.
// ─────────────────────────────────────────────────────────────────

export function OverlayWindow() {
  const overlayRoot = document.getElementById("overlay-root");
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

  useStealthMouse(panelRef, is_stealth_mode);

  if (!overlayRoot || !is_visible) return null;

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
            "overlay-panel w-[420px] max-h-[520px] flex flex-col gap-0 no-select transition-opacity duration-150",
            is_stealth_mode && "opacity-90"
          )}
          style={{ pointerEvents: is_stealth_mode ? "none" : "auto" }}
        >
          {/* Drag handle */}
          <div
            data-drag-handle
            className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing border-b border-white/5"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-brand-300/60">
                ConfideQ
              </span>
              <OverlayNetworkBadge color={network_color} />
            </div>
            <div className="flex items-center gap-1">
              {is_stealth_mode && (
                <span className="text-[9px] text-brand-400/50 font-mono">STEALTH</span>
              )}
              {is_proctor_safe && (
                <span className="text-[9px] text-success/50 font-mono">SAFE</span>
              )}
            </div>
          </div>

          {/* Panic overlay */}
          {is_panic_visible && panic_content && (
            <div className="px-4 py-3 bg-warning/10 border-b border-warning/20 animate-fade-in">
              <p className="text-xs font-semibold text-warning mb-2">🆘 Breathe</p>
              <ol className="space-y-1.5 text-xs text-overlay-text">
                <li>1. {panic_content.step_1}</li>
                <li>2. {panic_content.step_2}</li>
                <li>3. {panic_content.step_3}</li>
              </ol>
            </div>
          )}

          {/* Question bar */}
          {current_question && !is_panic_visible && (
            <OverlayQuestionBar question={current_question} />
          )}

          {/* Hint panel */}
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
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-white/5 text-[9px] text-muted-foreground/40 font-mono">
            <span>⌃⇧H hide · Esc clear · ⌃⇧P panic</span>
            <span className="capitalize">{hint_style.replace("_", " ")}</span>
          </div>
        </div>
      </OverlayPositionManager>
    </StealthMouseGuard>,
    overlayRoot
  );
}
