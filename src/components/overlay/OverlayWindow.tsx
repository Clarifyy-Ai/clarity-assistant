import { createPortal } from "react-dom";
import { useRef } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useStealthMouse } from "@/hooks/useStealthMouse";
import { OverlayHintPanel } from "./OverlayHintPanel";
import { OverlayQuestionBar } from "./OverlayQuestionBar";
import { OverlayNetworkBadge } from "./OverlayNetworkBadge";
import { OverlayToolbar } from "./OverlayToolbar";
import { OverlayTabBar } from "./OverlayTabBar";
import { OverlayChatInput } from "./OverlayChatInput";
import { OverlayAuditPanel } from "./OverlayAuditPanel";
import { OverlayResizeHandles } from "./OverlayResizeHandles";
import { StealthMouseGuard } from "./StealthMouseGuard";
import { OverlayPositionManager } from "./OverlayPositionManager";
import { LiveTranscriptStream } from "@/components/live/LiveTranscriptStream";
import { cn } from "@/lib/utils";

interface OverlayWindowProps {
  onToggleMic?:     () => void;
  onGenerate?:      () => void;
  onEndSession?:    () => void;
  onManualQuestion?: (question: string) => void;
}

export function OverlayWindow({
  onToggleMic,
  onGenerate,
  onEndSession,
  onManualQuestion,
}: OverlayWindowProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeContainerRef = useRef<HTMLDivElement>(null);

  const is_visible            = useOverlayStore((s) => s.is_visible);
  const is_stealth_mode       = useOverlayStore((s) => s.is_stealth_mode);
  const is_proctor_safe       = useOverlayStore((s) => s.is_proctor_safe);
  const is_panic_visible      = useOverlayStore((s) => s.is_panic_visible);
  const panic_content         = useOverlayStore((s) => s.panic_content);
  const position              = useOverlayStore((s) => s.position);
  const overlay_width         = useOverlayStore((s) => s.overlay_width);
  const overlay_height        = useOverlayStore((s) => s.overlay_height);
  const current_question      = useOverlayStore((s) => s.current_question);
  const current_hint          = useOverlayStore((s) => s.current_hint);
  const streaming_buffer      = useOverlayStore((s) => s.streaming_buffer);
  const hint_state            = useOverlayStore((s) => s.hint_state);
  const hint_style            = useOverlayStore((s) => s.hint_style);
  const network_color         = useOverlayStore((s) => s.network_color);
  const error_message         = useOverlayStore((s) => s.error_message);
  const screenshot_hint       = useOverlayStore((s) => s.screenshot_hint);
  const is_screenshot_loading = useOverlayStore((s) => s.is_screenshot_loading);
  const active_tab            = useOverlayStore((s) => s.active_tab);

  useStealthMouse(panelRef, is_stealth_mode);

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
          ref={resizeContainerRef}
          className={cn(
            "overlay-panel no-select flex flex-col gap-0 transition-opacity duration-150 relative",
            is_stealth_mode && "opacity-90"
          )}
          style={{
            pointerEvents: is_stealth_mode ? "none" : "auto",
            width:  overlay_width,
            height: overlay_height,
          }}
          role="dialog"
          aria-label="Clarify AI Overlay"
        >
          <div
            data-drag-handle
            className="flex cursor-grab items-center justify-between border-b border-white/5 px-4 py-2 active:cursor-grabbing shrink-0"
            title="Drag to move"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-300/60">
                Clarify AI
              </span>
              <OverlayNetworkBadge color={network_color} />
            </div>
            <div className="flex items-center gap-1.5">
              {is_stealth_mode && (
                <span className="font-mono text-[9px] text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded">STEALTH</span>
              )}
              {is_proctor_safe && (
                <span className="font-mono text-[9px] text-emerald-400/70 bg-emerald-500/10 px-1.5 py-0.5 rounded">SAFE</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); useOverlayStore.getState().hideOverlay(); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground/50 hover:text-white transition-colors"
                title="Hide overlay (Ctrl+Shift+H)"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <OverlayToolbar
            onToggleMic={onToggleMic}
            onGenerate={onGenerate}
            onEndSession={onEndSession}
          />

          {is_panic_visible && panic_content && (
            <div className="animate-fade-in border-b border-warning/20 bg-warning/10 px-4 py-3 shrink-0">
              <p className="mb-2 text-xs font-semibold text-warning">Take a breath</p>
              <ol className="space-y-1.5 text-xs text-overlay-text">
                <li>1. {panic_content.step_1}</li>
                <li>2. {panic_content.step_2}</li>
                <li>3. {panic_content.step_3}</li>
              </ol>
              <button
                onClick={() => useOverlayStore.getState().hidePanic()}
                className="mt-2 text-[10px] text-brand-300 hover:text-brand-200"
              >
                I'm ready — continue
              </button>
            </div>
          )}

          {!is_panic_visible && (
            <>
              {current_question && (
                <OverlayQuestionBar question={current_question} />
              )}

              <OverlayTabBar />

              <div className="flex-1 overflow-y-auto min-h-0">
                {active_tab === "answer" && (
                  <OverlayHintPanel
                    text={displayText}
                    hintStyle={hint_style}
                    hintState={hint_state}
                    errorMessage={error_message}
                    screenshotHint={screenshot_hint}
                    isScreenshotLoading={is_screenshot_loading}
                  />
                )}

                {active_tab === "transcript" && (
                  <div className="p-3">
                    <LiveTranscriptStream />
                  </div>
                )}

                {active_tab === "audit" && (
                  <OverlayAuditPanel />
                )}
              </div>

              {onManualQuestion && (
                <OverlayChatInput onSubmit={onManualQuestion} />
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t border-white/5 px-4 py-1 font-mono text-[9px] text-muted-foreground/40 shrink-0">
            <span>⌃⇧H hide · Esc clear · ⌃⇧P panic</span>
            <span className="capitalize">{hint_style.replace("_", " ")}</span>
          </div>

          {!is_stealth_mode && (
            <OverlayResizeHandles containerRef={resizeContainerRef} />
          )}
        </div>
      </OverlayPositionManager>
    </StealthMouseGuard>,
    overlayRoot
  );
}
