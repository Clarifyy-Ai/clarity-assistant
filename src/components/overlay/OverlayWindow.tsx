// src/components/overlay/OverlayWindow.tsx
import { createPortal } from "react-dom";
import { useRef, useCallback, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";
import { useStealthMouse } from "@/hooks/useStealthMouse";
import { OverlayHintPanel } from "./OverlayHintPanel";
import { OverlayQuestionBar } from "./OverlayQuestionBar";
import { OverlayNetworkBadge } from "./OverlayNetworkBadge";
import { OverlayToolbar } from "./OverlayToolbar";
import { OverlayTabBar } from "./OverlayTabBar";
import { OverlayChatPanel } from "./OverlayChatPanel";
import { OverlayAuditPanel } from "./OverlayAuditPanel";
import { OverlayResumePanel } from "./OverlayResumePanel";
import { OverlayQuickStart } from "./OverlayQuickStart";
import { OverlayResizeHandles } from "./OverlayResizeHandles";
import { StealthMouseGuard } from "./StealthMouseGuard";
import { OverlayPositionManager } from "./OverlayPositionManager";
import { LiveTranscriptStream } from "@/components/live/LiveTranscriptStream";
import { OverlaySessionStats } from "./OverlaySessionStats";
import { OverlayHotkeyHelp } from "./OverlayHotkeyHelp";
import { OverlayAnswerTimer } from "./OverlayAnswerTimer";
import { OverlayAudioBadge } from "./OverlayAudioBadge";
import { OverlayQuestionPreview } from "./OverlayQuestionPreview";
import { cn } from "@/lib/utils";
import { Loader2, Maximize2, Sparkles, BarChart3 } from "lucide-react";
import type { LiveSessionConfig } from "@/types/session.types";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { useDocumentPiP } from "@/lib/overlay/useDocumentPiP";

interface OverlayWindowProps {
  onToggleMic?: () => void;
  onToggleSystemAudio?: () => void;
  onGenerate?: () => void;
  onEndSession?: () => void;
  onManualQuestion?: (question: string) => void;
  onStartSession?: (config: LiveSessionConfig) => void;
  onSetupNewSession?: () => void;
  lastSessionId?: string | null;
}

export function OverlayWindow({
  onToggleMic,
  onToggleSystemAudio,
  onGenerate,
  onEndSession,
  onManualQuestion,
  onStartSession,
  onSetupNewSession,
  lastSessionId,
}: OverlayWindowProps) {
  const panelRef            = useRef<HTMLDivElement>(null);
  const resizeContainerRef  = useRef<HTMLDivElement>(null);

  const is_visible          = useOverlayStore((s) => s.is_visible);
  const is_stealth_mode     = useOverlayStore((s) => s.is_stealth_mode);
  const is_proctor_safe     = useOverlayStore((s) => s.is_proctor_safe);
  const is_panic_visible    = useOverlayStore((s) => s.is_panic_visible);
  const panic_content       = useOverlayStore((s) => s.panic_content);
  const position            = useOverlayStore((s) => s.position);
  const overlay_width       = useOverlayStore((s) => s.overlay_width);
  const overlay_height      = useOverlayStore((s) => s.overlay_height);
  const current_question    = useOverlayStore((s) => s.current_question);
  const current_hint        = useOverlayStore((s) => s.current_hint);
  const streaming_buffer    = useOverlayStore((s) => s.streaming_buffer);
  const hint_state          = useOverlayStore((s) => s.hint_state);
  const hint_style          = useOverlayStore((s) => s.hint_style);
  const network_color       = useOverlayStore((s) => s.network_color);
  const error_message       = useOverlayStore((s) => s.error_message);
  const screenshot_hint     = useOverlayStore((s) => s.screenshot_hint);
  const is_screenshot_loading = useOverlayStore((s) => s.is_screenshot_loading);
  const active_tab          = useOverlayStore((s) => s.active_tab);
  const stealth_opacity     = useOverlayStore((s) => s.stealth_opacity);
  const is_peek_active      = useOverlayStore((s) => s.is_peek_active);
  const is_minimal_mode     = useOverlayStore((s) => s.is_minimal_mode);

  const sessionStatus    = useSessionStore((s) => s.status);
  const isSessionActive  = sessionStatus === "active";

  const deepgramStatus   = useAudioStore((s) => s.deepgram_status);
  const stream_error     = useAudioStore((s) => s.streams?.error ?? null);
  const isRecording      = deepgramStatus === "connected";
  const isGenerating     = hint_state === "generating" || hint_state === "streaming";

  const handlePositionChange = useCallback(
    (pos: import("@/store/overlayStore").OverlayPosition) =>
      useOverlayStore.getState().setPosition(pos),
    []
  );

  useStealthMouse(panelRef, is_stealth_mode);

  const pipDoc      = useDocumentPiP(false);
  const targetDoc   = pipDoc ?? (typeof document !== "undefined" ? document : null);
  const overlayRoot = targetDoc?.getElementById("overlay-root") ?? targetDoc?.body ?? null;

  useEffect(() => {
    useOverlayStore.getState().setPipActive(!!pipDoc);
    return () => useOverlayStore.getState().setPipActive(false);
  }, [pipDoc]);

  if (!overlayRoot || (!is_visible && !is_peek_active)) return null;

  const displayText      = hint_state === "streaming" ? streaming_buffer : current_hint;
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
            "overlay-panel no-select flex flex-col gap-0 relative overflow-hidden",
            "rounded-2xl border border-white/[0.08]",
            "bg-[#0a0a14]/92 backdrop-blur-2xl",
            "shadow-[0_8px_64px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.06)]",
            "transition-opacity duration-150",
            is_stealth_mode && "overlay-stealth-glass",
            is_proctor_safe && "overlay-proctor-safe",
          )}
          style={{
            width: overlay_width,
            height: is_minimal_mode ? "auto" : overlay_height,
            opacity: effectiveOpacity,
          }}
          role="dialog"
          aria-label="Clarify AI Overlay"
        >
          {/* Top gradient accent line */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent pointer-events-none" />

          {/* ── HEADER ─────────────────────────────────────────────── */}
          <div
            data-drag-handle
            className={cn(
              "flex cursor-grab items-center gap-2 px-3 py-2 shrink-0 active:cursor-grabbing",
              "border-b border-white/[0.07]",
              "bg-gradient-to-r from-[#0d0d1e]/80 via-[#0e0e1c]/60 to-[#0d0d1e]/80",
            )}
            title="Drag to move"
          >
            {/* Logo + name */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <span className="text-[12px] font-bold tracking-wide text-white/90 select-none">
                Clarify AI
              </span>
            </div>

            {/* Live recording indicator */}
            {isRecording && (
              <div className="flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]" title="Recording" />
                <span className="text-[10px] font-mono text-red-400/70">LIVE</span>
              </div>
            )}

            <OverlayNetworkBadge color={network_color} />

            {/* Mode badges */}
            {is_stealth_mode && (
              <span className="font-mono text-[9px] font-bold text-violet-300 bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 rounded shrink-0">
                STEALTH
              </span>
            )}
            {is_proctor_safe && (
              <span className="font-mono text-[9px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">
                SAFE
              </span>
            )}
            {is_peek_active && (
              <span className="font-mono text-[9px] font-bold text-sky-300 bg-sky-500/15 border border-sky-500/20 px-1.5 py-0.5 rounded shrink-0 animate-pulse">
                PEEK
              </span>
            )}
            {isSessionActive && !is_minimal_mode && <OverlayAudioBadge />}
            {isSessionActive && !is_minimal_mode && <OverlayAnswerTimer />}

            <div className="flex-1" />

            {is_minimal_mode && (
              <button
                onClick={(e) => { e.stopPropagation(); useOverlayStore.getState().setMinimalMode(false); }}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 text-amber-400/70 hover:text-amber-300 transition-all"
                title="Exit minimal mode"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); useOverlayStore.getState().hideOverlay(); }}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 text-white/25 hover:text-white/80 transition-all"
              title="Hide overlay (Ctrl+Shift+H)"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Screen capture warning ──────────────────────────────── */}
          <ScreenCaptureBanner isProctorSafe={is_proctor_safe} />

          {/* ── Session complete ────────────────────────────────────── */}
          {!isSessionActive && lastSessionId && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-8 text-center">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute -inset-1 rounded-2xl bg-emerald-500/10 blur-md" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white/90">Session Complete</p>
                <p className="text-[12px] text-white/35 mt-1">Great work — review your performance</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                {lastSessionId && (
                  <Link
                    to={`/app/debrief/${lastSessionId}`}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600/30 to-violet-600/20 hover:from-indigo-600/40 hover:to-violet-600/30 text-indigo-300 text-[12px] font-semibold rounded-xl border border-indigo-500/25 transition-all shadow-md"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate Debrief
                  </Link>
                )}
                {lastSessionId && (
                  <Link
                    to={`/app/scorecard/${lastSessionId}`}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-[12px] font-medium rounded-xl border border-white/8 transition-all"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    View Scorecard
                  </Link>
                )}
                {onSetupNewSession && (
                  <button
                    onClick={onSetupNewSession}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/3 hover:bg-white/8 text-white/35 hover:text-white text-[12px] font-medium rounded-xl border border-white/6 transition-all"
                  >
                    New Session
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Minimal mode ─────────────────────────────────────────── */}
          {is_minimal_mode && isSessionActive && (
            <div className="flex items-center gap-2 px-3 py-2 shrink-0">
              <div className="flex-1" />
              <FloatingAIButton onGenerate={onGenerate} isGenerating={isGenerating} compact />
            </div>
          )}

          {/* ── Full content ─────────────────────────────────────────── */}
          {!is_minimal_mode && (
            <>
              {!is_panic_visible && isSessionActive && (
                <OverlayToolbar
                  onToggleMic={onToggleMic}
                  onToggleSystemAudio={onToggleSystemAudio}
                  onGenerate={onGenerate}
                  onEndSession={onEndSession}
                />
              )}

              {is_panic_visible && panic_content && (
                <div className="animate-fade-in border-b border-amber-500/15 bg-gradient-to-b from-amber-500/10 to-amber-500/5 px-4 py-3 shrink-0">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-[13px]">🫁</span>
                    <p className="text-xs font-bold text-amber-300">Take a breath — you've got this</p>
                  </div>
                  <ol className="space-y-1.5 text-xs text-white/70 leading-relaxed">
                    <li className="flex gap-2"><span className="text-amber-400 font-bold">1.</span>{panic_content.step_1}</li>
                    <li className="flex gap-2"><span className="text-amber-400 font-bold">2.</span>{panic_content.step_2}</li>
                    <li className="flex gap-2"><span className="text-amber-400 font-bold">3.</span>{panic_content.step_3}</li>
                  </ol>
                  <button
                    onClick={() => useOverlayStore.getState().hidePanic()}
                    className="mt-2.5 text-[11px] font-semibold text-amber-300 hover:text-amber-200 transition-colors border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1 rounded-lg"
                  >
                    I'm ready — continue →
                  </button>
                </div>
              )}

              {!is_panic_visible && (
                <>
                  {stream_error && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/15 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                      <span className="text-[11px] text-red-400 truncate flex-1">
                        {stream_error.message}
                        {stream_error.suggestion && ` — ${stream_error.suggestion}`}
                      </span>
                      <button
                        onClick={() => useAudioStore.getState().setStreamError(null)}
                        className="text-red-400/50 hover:text-red-400 text-[11px] shrink-0 transition-colors"
                      >
                        dismiss
                      </button>
                    </div>
                  )}

                  {!isSessionActive && !lastSessionId && onStartSession && (
                    <OverlayQuickStart onStart={onStartSession} />
                  )}

                  {/* Tab bar + panels — always visible during session, and chat/status available outside session */}
                  <>
                    {isSessionActive && current_question && <OverlayQuestionBar question={current_question} />}
                    {isSessionActive && <OverlayQuestionPreview />}
                    <OverlayTabBar />
                    <div className={cn(
                      "min-h-0",
                      active_tab === "chat" ? "flex-1 flex flex-col" : "overflow-y-auto flex-1"
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
                      {active_tab === "chat" && onManualQuestion && (
                        <OverlayChatPanel onSubmit={onManualQuestion} />
                      )}
                      {active_tab === "transcript" && (
                        <div className="p-3">
                          <LiveTranscriptStream />
                        </div>
                      )}
                      {active_tab === "resume"     && <OverlayResumePanel />}
                      {active_tab === "audit"      && <OverlayAuditPanel />}
                    </div>
                  </>
                </>
              )}
            </>
          )}

          {isSessionActive && <OverlaySessionStats />}

          {/* ── Footer hint ─────────────────────────────────────────── */}
          {isSessionActive && !is_minimal_mode && (
            <div className="flex items-center justify-between border-t border-white/[0.04] px-3 py-1 shrink-0">
              <span className="font-mono text-[10px] text-white/15 truncate select-none">
                ⌃⇧H · Esc · ⌃⇧P
              </span>
              <span className="text-[10px] text-white/20 capitalize shrink-0">
                {hint_style.replace("_", " ")}
              </span>
            </div>
          )}

          {/* ── Resize handles ────────────────────────────────────────── */}
          <div
            className={cn(is_stealth_mode && "opacity-50 hover:opacity-80 transition-opacity")}
            style={{ pointerEvents: "auto" }}
          >
            <OverlayResizeHandles containerRef={resizeContainerRef} />
          </div>

          <OverlayHotkeyHelp />
        </div>
      </OverlayPositionManager>
    </StealthMouseGuard>,
    overlayRoot
  );
}

function FloatingAIButton({
  onGenerate,
  isGenerating,
  compact = false,
}: {
  onGenerate?: () => void;
  isGenerating: boolean;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onGenerate}
      disabled={isGenerating}
      className={cn(
        "w-full flex items-center justify-center gap-2 font-semibold rounded-xl transition-all",
        "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500",
        "text-white shadow-lg shadow-indigo-500/25 disabled:opacity-70 disabled:cursor-not-allowed",
        "border border-white/10 hover:border-white/20",
        isGenerating && "overlay-fab-glow",
        compact ? "py-1.5 text-[11px]" : "py-2.5 text-[13px]"
      )}
      title="Get AI Answer (Ctrl+Shift+G)"
    >
      {isGenerating ? (
        <>
          <Loader2 className={cn("animate-spin shrink-0", compact ? "w-3 h-3" : "w-4 h-4")} />
          <span>Generating…</span>
        </>
      ) : (
        <>
          <Sparkles className={compact ? "w-3 h-3" : "w-4 h-4"} />
          <span>Get AI Answer</span>
        </>
      )}
    </button>
  );
}

function ScreenCaptureBanner({ isProctorSafe }: { isProctorSafe: boolean }) {
  const [detected,  setDetected]  = useState<"recording" | "sharing" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent<{ type: "recording" | "sharing" }>;
      setDetected(evt.detail.type);
      setDismissed(false);
    };
    window.addEventListener("clarify:screencapture", handler);
    return () => window.removeEventListener("clarify:screencapture", handler);
  }, []);

  if (!isProctorSafe || dismissed || !detected) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/15 shrink-0">
      <span className="text-[11px] flex-1 text-amber-400">
        ⚠ {detected === "recording" ? "Screen recording" : "Screen sharing"} detected
      </span>
      <button
        onClick={toggleAppStealthMode}
        className="text-[10px] font-bold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-0.5 rounded-md transition-colors shrink-0"
      >
        Enable Stealth
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400/40 hover:text-amber-400 text-[10px] shrink-0 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
