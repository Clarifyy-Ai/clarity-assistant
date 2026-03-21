import { createPortal } from "react-dom";
import { useRef } from "react";
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
// Floating overlay rendered via a portal into #overlay-root —
// a separate DOM node outside #root for compositor-layer isolation.
// The #overlay-root div is declared in index.html.
// ─────────────────────────────────────────────────────────────────

export function OverlayWindow() {
  const panelRef = useRef<HTMLDivElement>(null);

  // Individual selectors — prevents re-renders from unrelated store churn
  // (streaming_buffer is updated on every token; without selectors every
  //  component subscribed to the full store would re-render on each token)
  const is_visible            = useOverlayStore((s) => s.is_visible);
  const is_stealth_mode       = useOverlayStore((s) => s.is_stealth_mode);
  const is_proctor_safe       = useOverlayStore((s) => s.is_proctor_safe);
  const is_panic_visible      = useOverlayStore((s) => s.is_panic_visible);
  const panic_content         = useOverlayStore((s) => s.panic_content);
  const position              = useOverlayStore((s) => s.position);
  const current_question      = useOverlayStore((s) => s.current_question);
  const current_hint          = useOverlayStore((s) => s.current_hint);
  const streaming_buffer      = useOverlayStore((s) => s.streaming_buffer);
  const hint_state            = useOverlayStore((s) => s.hint_state);
  const hint_style            = useOverlayStore((s) => s.hint_style);
  const network_color         = useOverlayStore((s) => s.network_color);
  const error_message         = useOverlayStore((s) => s.error_message);
  const screenshot_hint       = useOverlayStore((s) => s.screenshot_hint);
  const is_screenshot_loading = useOverlayStore((s) => s.is_screenshot_loading);

  useStealthMouse(panelRef, is_stealth_mode);

  // Resolve the portal target directly — it always exists in the DOM
  const overlayRoot =
    typeof document !== "undefined"
      ? document.getElementById("overlay-root")
      : null;

  if (!overlayRoot || !is_visible) return null;

  const displayText = hint_state === "streaming" ? streaming_buffer : current_hint;

  return createPortal(
    <StealthMouseGuard isActive={is_stealth_mode}>
      <OverlayPositionManager
        ref={panelRef}
        position={position}
        onPositionChange={(pos) => useOverlayStore.getState().setPosition(pos)}
        isProctorSafe={is_proctor_safe}
      >
        <div
          className={cn(
            "overlay-panel no-select flex max-h-[520px] w-[420px] flex-col gap-0 transition-opacity duration-150",
            is_stealth_mode && "opacity-90"
          )}
          style={{ pointerEvents: is_stealth_mode ? "none" : "auto" }}
          role="dialog"
          aria-label="Clarity AI Overlay"
        >
          {/* Top bar / drag handle */}
          <div
            data-drag-handle
            className="flex cursor-grab items-center justify-between border-b border-white/5 px-4 py-2 active:cursor-grabbing"
            title="Drag to move"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-300/60">
                Clarity AI
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
    overlayRoot
  );
}
