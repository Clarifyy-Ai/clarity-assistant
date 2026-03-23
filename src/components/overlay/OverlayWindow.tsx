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
import { OverlayActivityTimer } from "./OverlayActivityTimer";
import { OverlayHotkeyHelp } from "./OverlayHotkeyHelp";
import { OverlayAnswerTimer } from "./OverlayAnswerTimer";
import { OverlayAudioBadge } from "./OverlayAudioBadge";
import { OverlayQuestionPreview } from "./OverlayQuestionPreview";
import { cn } from "@/lib/utils";
import { Loader2, SlidersHorizontal, Maximize2 } from "lucide-react";
import type { LiveSessionConfig } from "@/types/session.types";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";

// ★ NEW: import DPiP helper
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
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeContainerRef = useRef<HTMLDivElement>(null);
  const [showOpacitySlider, setShowOpacitySlider] = useState(false);

  const is_visible = useOverlayStore((s) => s.is_visible);
  const is_stealth_mode = useOverlayStore((s) => s.is_stealth_mode);
  const is_proctor_safe = useOverlayStore((s) => s.is_proctor_safe);
  const is_panic_visible = useOverlayStore((s) => s.is_panic_visible);
  const panic_content = useOverlayStore((s) => s.panic_content);
  const position = useOverlayStore((s) => s.position);
  const overlay_width = useOverlayStore((s) => s.overlay_width);
  const overlay_height = useOverlayStore((s) => s.overlay_height);
  const current_question = useOverlayStore((s) => s.current_question);
  const current_hint = useOverlayStore((s) => s.current_hint);
  const streaming_buffer = useOverlayStore((s) => s.streaming_buffer);
  const hint_state = useOverlayStore((s) => s.hint_state);
  const hint_style = useOverlayStore((s) => s.hint_style);
  const network_color = useOverlayStore((s) => s.network_color);
  const error_message = useOverlayStore((s) => s.error_message);
  const screenshot_hint = useOverlayStore((s) => s.screenshot_hint);
  const is_screenshot_loading = useOverlayStore((s) => s.is_screenshot_loading);
  const active_tab = useOverlayStore((s) => s.active_tab);
  const stealth_opacity = useOverlayStore((s) => s.stealth_opacity);
  const is_peek_active = useOverlayStore((s) => s.is_peek_active);
  const is_minimal_mode = useOverlayStore((s) => s.is_minimal_mode);

  const sessionStatus = useSessionStore((s) => s.status);
  const isSessionActive = sessionStatus === "active";

  const deepgramStatus = useAudioStore((s) => s.deepgram_status);
  const stream_error = useAudioStore((s) => s.streams?.error ?? null);
  const isRecording = deepgramStatus === "connected";
  const isGenerating = hint_state === "generating" || hint_state === "streaming";

  const handlePositionChange = useCallback(
    (pos: import("@/store/overlayStore").OverlayPosition) =>
      useOverlayStore.getState().setPosition(pos),
    []
  );

  useStealthMouse(panelRef, is_stealth_mode);

  // ★ NEW: open DPiP window when overlay is visible
  const pipDoc = useDocumentPiP(is_visible);
  const targetDoc = pipDoc ?? (typeof document !== "undefined" ? document : null);
  const overlayRoot = targetDoc?.getElementById("overlay-root");

  // Inform store so other modules (e.g., WindowVisibilityManager) can adapt
  useEffect(() => {
    useOverlayStore.getState().setPipActive(!!pipDoc);
    return () => useOverlayStore.getState().setPipActive(false);
  }, [pipDoc]);

  if (!overlayRoot || (!is_visible && !is_peek_active)) return null;

  const displayText = hint_state === "streaming" ? streaming_buffer : current_hint;
  const effectiveOpacity = stealth_opacity / 100;
  const proctorSafeClass = is_proctor_safe ? "overlay-proctor-safe" : "";

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
            is_stealth_mode && "overlay-stealth-glass",
            proctorSafeClass,
          )}
          style={{
            width: overlay_width,
            height: is_minimal_mode ? "auto" : overlay_height,
            opacity: effectiveOpacity,
          }}
          role="dialog"
          aria-label="Clarify AI Overlay"
        >
          {/* ── HEADER ───────────────────────────────────────────────────────────── */}
          <div
            data-drag-handle
            className="flex cursor-grab items-center justify-between border-b border-white/8 px-3 py-2 active:cursor-grabbing shrink-0"
            title="Drag to move"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-bold tracking-widest text-brand-300/80 shrink-0">
                Clarify AI
              </span>
              <OverlayNetworkBadge color={network_color} />
              {isRecording && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> REC
                </span>
              )}
              {is_stealth_mode && (
                <span className="font-mono text-[10px] font-semibold text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded shrink-0">
                  STEALTH
                </span>
              )}
              {is_proctor_safe && (
                <span className="font-mono text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded shrink-0">
                  SAFE
                </span>
              )}
              {is_peek_active && (
                <span className="font-mono text-[10px] font-semibold text-sky-300 bg-sky-500/15 px-1.5 py-0.5 rounded shrink-0 animate-pulse">
                  PEEK
                </span>
              )}
              {isSessionActive && !is_minimal_mode && <OverlayAudioBadge />}
              {isSessionActive && !is_minimal_mode && <OverlayAnswerTimer />}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Opacity control */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOpacitySlider((v) => !v);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors"
                  title={`Opacity: ${stealth_opacity}%`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                </button>
                {showOpacitySlider && (
                  <div
                    className="absolute top-full right-0 mt-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[10px] text-muted-foreground/60 font-mono w-8 text-right">
                      {stealth_opacity}%
                    </span>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={stealth_opacity}
                      onChange={(e) =>
                        useOverlayStore.getState().setStealthOpacity(Number(e.target.value))
                      }
                      className="w-20 h-1 accent-brand-400 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {is_minimal_mode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    useOverlayStore.getState().setMinimalMode(false);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 text-amber-400/70 hover:text-amber-300 transition-colors"
                  title="Exit minimal mode"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useOverlayStore.getState().hideOverlay();
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 text-muted-foreground/40 hover:text-white transition-colors"
                title="Hide overlay (Ctrl+Shift+H)"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Screen-capture warning banner remains as-is */}
          <ScreenCaptureBanner isProctorSafe={is_proctor_safe} />

          {/* Session end debrief block */}
          {!isSessionActive && lastSessionId && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-overlay-text">Session Complete</p>
                <p className="text-[12px] text-muted-foreground/50 mt-1">What next?</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                {lastSessionId && (
                  <Link
                    to={`/app/debrief/${lastSessionId}`}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 text-[12px] font-medium rounded-xl border border-brand-500/20 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    Generate Debrief
                  </Link>
                )}
                {lastSessionId && (
                  <Link
                    to={`/app/scorecard/${lastSessionId}`}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground/60 hover:text-white text-[12px] font-medium rounded-xl border border-white/8 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    View Scorecard
                  </Link>
                )}
                {onSetupNewSession && (
                  <button
                    onClick={onSetupNewSession}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground/50 hover:text-white text-[12px] font-medium rounded-xl border border-white/8 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    New Session
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Minimal-mode */}
          {is_minimal_mode && isSessionActive && (
            <div className="flex items-center gap-2 px-3 py-2 shrink-0">
              <OverlayActivityTimer />
              <div className="flex-1" />
              <FloatingAIButton onGenerate={onGenerate} isGenerating={isGenerating} compact />
            </div>
          )}

          {/* Full content */}
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
                <div className="animate-fade-in border-b border-warning/20 bg-warning/10 px-4 py-3 shrink-0">
                  <p className="mb-2 text-xs font-semibold text-warning">Take a breath</p>
                  <ol className="space-y-1.5 text-xs text-overlay-text">
                    <li>1. {panic_content.step_1}</li>
                    <li>2. {panic_content.step_2}</li>
                    <li>3. {panic_content.step_3}</li>
                  </ol>
                  <button
                    onClick={() => useOverlayStore.getState().hidePanic()}
                    className="mt-2 text-[11px] text-brand-300 hover:text-brand-200"
                  >
                    I'm ready — continue
                  </button>
                </div>
              )}

              {!is_panic_visible && (
                <>
                  {stream_error && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 shrink-0">
                      <span className="text-[11px] text-red-400 truncate flex-1">
                        {stream_error.message}
                        {stream_error.suggestion && ` — ${stream_error.suggestion}`}
                      </span>
                      <button
                        onClick={() => useAudioStore.getState().setStreamError(null)}
                        className="text-red-400/60 hover:text-red-400 text-[11px] shrink-0"
                      >
                        dismiss
                      </button>
                    </div>
                  )}

                  {!isSessionActive && !lastSessionId && onStartSession && (
                    <OverlayQuickStart onStart={onStartSession} />
                  )}

                  {isSessionActive && (
                    <>
                      {current_question && <OverlayQuestionBar question={current_question} />}
                      <OverlayQuestionPreview />
                      <OverlayTabBar />
                      <div className={cn("min-h-0", active_tab === "chat" ? "flex-1 flex flex-col" : "overflow-y-auto flex-1")}>
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
                        {active_tab === "chat" && onManualQuestion && <OverlayChatPanel onSubmit={onManualQuestion} />}
                        {active_tab === "transcript" && (
                          <div className="p-3">
                            <LiveTranscriptStream />
                          </div>
                        )}
                        {active_tab === "resume" && <OverlayResumePanel />}
                        {active_tab === "audit" && <OverlayAuditPanel />}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {isSessionActive && <OverlaySessionStats />}

          {isSessionActive && (
            <div className="flex items-center justify-between border-t border-white/5 px-3 py-1.5 font-mono text-[11px] text-muted-foreground/40 shrink-0">
              <span className="truncate"> ⌃⇧H hide · Esc clear · ⌃⇧P panic · ⌃⇧/ help </span>
              <div className="flex items-center gap-2">
                <OverlayActivityTimer />
                <span className="capitalize">{hint_style.replace("_", " ")}</span>
              </div>
            </div>
          )}

          {/* resize handles */}
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
        "text-white shadow-lg disabled:opacity-70 disabled:cursor-not-allowed",
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
          <span className={compact ? "text-[12px]" : "text-[15px]"}>✦</span>
          <span>Get AI Answer</span>
        </>
      )}
    </button>
  );
}

function ScreenCaptureBanner({ isProctorSafe }: { isProctorSafe: boolean }) {
  const [detected, setDetected] = useState<"recording" | "sharing" | null>(null);
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
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/15 border-b border-amber-500/25 shrink-0">
      <span className="text-amber-400 text-[11px] font-semibold flex-1">
        ⚠ {detected === "recording" ? "Screen recording" : "Screen sharing"} detected — enable Stealth Mode to hide overlay
      </span>
      <button onClick={toggleAppStealthMode} className="text-[10px] font-semibold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-0.5 rounded transition-colors shrink-0">
        Enable Stealth
      </button>
      <button onClick={() => setDismissed(true)} className="text-amber-400/50 hover:text-amber-400 text-[10px] shrink-0">
        ✕
      </button>
    </div>
  );
}
``
