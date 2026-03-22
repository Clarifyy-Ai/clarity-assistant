import { createPortal } from "react-dom";
import { useRef, useCallback } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useAudioStore } from "@/store/audioStore";
import { useStealthMouse } from "@/hooks/useStealthMouse";
import { OverlayHintPanel } from "./OverlayHintPanel";
import { OverlayQuestionBar } from "./OverlayQuestionBar";
import { OverlayNetworkBadge } from "./OverlayNetworkBadge";
import { OverlayToolbar } from "./OverlayToolbar";
import { OverlayTabBar } from "./OverlayTabBar";
import { OverlayChatInput } from "./OverlayChatInput";
import { OverlayAuditPanel } from "./OverlayAuditPanel";
import { OverlayResumePanel } from "./OverlayResumePanel";
import { OverlayResizeHandles } from "./OverlayResizeHandles";
import { StealthMouseGuard } from "./StealthMouseGuard";
import { OverlayPositionManager } from "./OverlayPositionManager";
import { LiveTranscriptStream } from "@/components/live/LiveTranscriptStream";
import { OverlaySessionStats } from "./OverlaySessionStats";
import { OverlayActivityTimer } from "./OverlayActivityTimer";
import { OverlayHotkeyHelp } from "./OverlayHotkeyHelp";
import { cn } from "@/lib/utils";

interface OverlayWindowProps {
  onToggleMic?:        () => void;
  onToggleSystemAudio?: () => void;
  onGenerate?:         () => void;
  onEndSession?:       () => void;
  onManualQuestion?:   (question: string) => void;
}

export function OverlayWindow({
  onToggleMic,
  onToggleSystemAudio,
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
  const stealth_opacity       = useOverlayStore((s) => s.stealth_opacity);
  const is_peek_active        = useOverlayStore((s) => s.is_peek_active);
  const is_minimal_mode       = useOverlayStore((s) => s.is_minimal_mode);
  const deepgramStatus        = useAudioStore((s) => s.deepgram_status);
  const stream_error          = useAudioStore((s) => s.streams?.error ?? null);
  const isRecording           = deepgramStatus === "connected";

  const handlePositionChange = useCallback(
    (pos: import("@/store/overlayStore").OverlayPosition) => useOverlayStore.getState().setPosition(pos),
    []
  );

  useStealthMouse(panelRef, is_stealth_mode);

  const overlayRoot =
    typeof document !== "undefined"
      ? document.getElementById("overlay-root")
      : null;

  if (!overlayRoot || (!is_visible && !is_peek_active)) return null;

  const displayText = hint_state === "streaming" ? streaming_buffer : current_hint;

  const effectiveOpacity = stealth_opacity / 100;

  return createPortal(
    <StealthMouseGuard isActive={is_stealth_mode}>
      <OverlayPositionManager
        ref={panelRef}
        position={position}
        onPositionChange={handlePositionChange}
        isProctorSafe={is_proctor_safe}
        overlayWidth={overlay_width}
        overlayHeight={overlay_height}
      >
        <div
          ref={resizeContainerRef}
          className={cn(
            "overlay-panel no-select flex flex-col gap-0 transition-opacity duration-150 relative overflow-hidden",
          )}
          style={{
            width:  overlay_width,
            height: is_minimal_mode ? "auto" : overlay_height,
            opacity: effectiveOpacity,
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
              {isRecording && (
                <span className="flex items-center gap-1 text-[9px] text-red-400/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  REC
                </span>
              )}
              {is_peek_active && (
                <span className="font-mono text-[9px] text-sky-400/70 bg-sky-500/10 px-1.5 py-0.5 rounded animate-pulse">PEEK</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {is_stealth_mode && (
                <span className="font-mono text-[9px] text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded">STEALTH</span>
              )}
              {is_proctor_safe && (
                <span className="font-mono text-[9px] text-emerald-400/70 bg-emerald-500/10 px-1.5 py-0.5 rounded">SAFE</span>
              )}
              {is_minimal_mode && (
                <button
                  onClick={(e) => { e.stopPropagation(); useOverlayStore.getState().setMinimalMode(false); }}
                  className="font-mono text-[9px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded hover:bg-amber-500/20 transition-colors"
                  title="Exit minimal mode"
                >
                  MIN ✕
                </button>
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

          {!is_minimal_mode && (
            <OverlayToolbar
              onToggleMic={onToggleMic}
              onToggleSystemAudio={onToggleSystemAudio}
              onGenerate={onGenerate}
              onEndSession={onEndSession}
            />
          )}

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
              {stream_error && !is_minimal_mode && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 shrink-0">
                  <span className="text-[10px] text-red-400 truncate flex-1">
                    {stream_error.message}
                    {stream_error.suggestion && ` — ${stream_error.suggestion}`}
                  </span>
                  <button
                    onClick={() => useAudioStore.getState().setStreamError(null)}
                    className="text-red-400/60 hover:text-red-400 text-[10px] shrink-0"
                  >
                    dismiss
                  </button>
                </div>
              )}

              {current_question && !is_minimal_mode && (
                <OverlayQuestionBar question={current_question} />
              )}

              {!is_minimal_mode && <OverlayTabBar />}

              <div className={cn(
                "min-h-0 overflow-y-auto",
                is_minimal_mode ? "max-h-[200px]" : "flex-1"
              )}>
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

                {active_tab === "resume" && (
                  <OverlayResumePanel />
                )}

                {active_tab === "audit" && (
                  <OverlayAuditPanel />
                )}
              </div>

              {onManualQuestion && !is_minimal_mode && (
                <OverlayChatInput onSubmit={onManualQuestion} />
              )}
            </>
          )}

          {!is_minimal_mode && <OverlaySessionStats />}

          {!is_minimal_mode && (
            <div className="flex items-center justify-between border-t border-white/5 px-2 sm:px-4 py-1 font-mono text-[8px] sm:text-[9px] text-muted-foreground/40 shrink-0">
              <span className="truncate">
                ⌃⇧H hide · Esc clear · ⌃⇧P panic · ⌃⇧/ help
              </span>
              <div className="flex items-center gap-2">
                <OverlayActivityTimer />
                <span className="capitalize">{hint_style.replace("_", " ")}</span>
              </div>
            </div>
          )}

          <div className={cn(is_stealth_mode && "opacity-50 hover:opacity-80 transition-opacity")} style={{ pointerEvents: "auto" }}>
            <OverlayResizeHandles containerRef={resizeContainerRef} />
          </div>

          <OverlayHotkeyHelp />
        </div>
      </OverlayPositionManager>
    </StealthMouseGuard>,
    overlayRoot
  );
}
