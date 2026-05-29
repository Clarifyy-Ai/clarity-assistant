// src/components/overlay/OverlayWindow.tsx
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useOverlayStore, type OverlayPosition } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";
import { useAuthStore } from "@/store/userStore";

import { supabase } from "@/lib/supabase/client";
import { useStealthMouse } from "@/hooks/useStealthMouse";
import { useDocumentPiP } from "@/lib/overlay/useDocumentPiP";
import { useIsMobile } from "@/hooks/use-mobile";

import { cn } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";

import type { LiveSessionConfig } from "@/types/session.types";
import { OverlayComplianceBanner } from "./OverlayComplianceBanner";

import { OverlayHintPanel } from "./OverlayHintPanel";
import { OverlayQuestionBar } from "./OverlayQuestionBar";
import { OverlayQuestionPreview } from "./OverlayQuestionPreview";
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
import { OverlaySessionStats } from "./OverlaySessionStats";
import { OverlayHotkeyHelp } from "./OverlayHotkeyHelp";
import { OverlayAnswerTimer } from "./OverlayAnswerTimer";
import { OverlayAudioBadge } from "./OverlayAudioBadge";
import { OverlaySystemAudioBanner } from "./OverlaySystemAudioBanner";

import { LiveTranscriptStream } from "@/components/live/LiveTranscriptStream";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

// IMPORTANT: must match the id used elsewhere (screenCaptureBlocker / panic kill)
const OVERLAY_ROOT_ID = "clarify-overlay-root";

function ensureOverlayRoot(doc: Document): HTMLElement {
  let el = doc.getElementById(OVERLAY_ROOT_ID) as HTMLElement | null;

  if (!el) {
    // Create a single stable portal host. Keep pointer-events:none on the host,
    // and enable pointer-events on the actual panel for clickability.
    el = doc.createElement("div");
    el.id = OVERLAY_ROOT_ID;
    el.style.cssText =
      "position:fixed;inset:0;z-index:9998;isolation:isolate;pointer-events:none;";
    doc.body.appendChild(el);
  }

  return el;
}

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
  const persistPositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isMobile = useIsMobile();

  // Overlay store state
  const isVisible = useOverlayStore((s) => s.is_visible);
  const isStealthMode = useOverlayStore((s) => s.is_stealth_mode);
  const isProctorSafe = useOverlayStore((s) => s.is_proctor_safe);
  const isPanicVisible = useOverlayStore((s) => s.is_panic_visible);
  const panicContent = useOverlayStore((s) => s.panic_content);

  const position = useOverlayStore((s) => s.position);
  const overlayWidth = useOverlayStore((s) => s.overlay_width);
  const overlayHeight = useOverlayStore((s) => s.overlay_height);

  const currentQuestion = useOverlayStore((s) => s.current_question);
  const currentHint = useOverlayStore((s) => s.current_hint);
  const streamingBuffer = useOverlayStore((s) => s.streaming_buffer);

  const hintState = useOverlayStore((s) => s.hint_state);
  const hintStyle = useOverlayStore((s) => s.hint_style);
  const networkColor = useOverlayStore((s) => s.network_color);

  const errorMessage = useOverlayStore((s) => s.error_message);
  const screenshotHint = useOverlayStore((s) => s.screenshot_hint);
  const isScreenshotLoading = useOverlayStore((s) => s.is_screenshot_loading);

  const activeTab = useOverlayStore((s) => s.active_tab);

  const stealthOpacity = useOverlayStore((s) => s.stealth_opacity);
  const isPeekActive = useOverlayStore((s) => s.is_peek_active);
  const isMinimalMode = useOverlayStore((s) => s.is_minimal_mode);

  // User profile for persisting position
  const profileId = useAuthStore((s) => s.profile?.id ?? null);

  // Session state
  const sessionStatus = useSessionStore((s) => s.status);
  const isSessionActive = sessionStatus === "active";

  // Audio state
  const deepgramStatus = useAudioStore((s) => s.deepgram_status);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);

  const isRecording = deepgramStatus === "connected";
  const isGenerating = hintState === "generating" || hintState === "streaming";

  // Persist position (debounced)
  const handlePositionChange = useCallback(
    (pos: OverlayPosition) => {
      useOverlayStore.getState().setPosition(pos);

      if (!profileId) return;
      if (persistPositionTimerRef.current) clearTimeout(persistPositionTimerRef.current);

      persistPositionTimerRef.current = setTimeout(() => {
        void supabase
          .from("profiles")
          .update({
            overlay_position: JSON.stringify(pos),
            updated_at: new Date().toISOString(),
          })
          .eq("id", profileId);
      }, 500);
    },
    [profileId]
  );

  useEffect(() => {
    return () => {
      if (persistPositionTimerRef.current) clearTimeout(persistPositionTimerRef.current);
    };
  }, []);

  // Stealth mouse behavior
  useStealthMouse(panelRef, isStealthMode);

  // Document PiP support (optional)
  const pipDoc = useDocumentPiP(false);
  const targetDoc = pipDoc ?? (typeof document !== "undefined" ? document : null);

  useEffect(() => {
    useOverlayStore.getState().setPipActive(!!pipDoc);
    return () => useOverlayStore.getState().setPipActive(false);
  }, [pipDoc]);

  // Portal mount node
  const overlayRoot = useMemo<HTMLElement | null>(() => {
    if (!targetDoc) return null;
    return ensureOverlayRoot(targetDoc);
  }, [targetDoc]);

  // Show logic:
  // - Normal overlay => isVisible
  // - Peek mode => show a small banner even when not visible
  const shouldShow = isVisible || isPeekActive;

  const displayText = hintState === "streaming" ? streamingBuffer : currentHint;

  // Panel opacity: discrete UI dimming is handled by StealthMouseGuard (avoids double-fade).
  const effectiveOpacity = !shouldShow ? 0 : isStealthMode ? 1 : 1;
  const guardStealthOpacity = Math.max(0.15, Math.min(1, stealthOpacity / 100));

  // Pill width constraints
  const pillWidth = isMobile ? "100%" : Math.min(640, Math.max(420, overlayWidth));

  // Keep overlay within viewport bounds (desktop browser mode)
  useEffect(() => {
    if (typeof window === "undefined" || isProctorSafe) return;

    const clamp = () => {
      const w = isMinimalMode ? Math.min(640, Math.max(420, overlayWidth)) : overlayWidth;
      const h = isMinimalMode ? 56 : overlayHeight;
      const maxX = Math.max(8, window.innerWidth - w - 8);
      const maxY = Math.max(8, window.innerHeight - h - 8);

      const cur = useOverlayStore.getState().position;
      const nx = Math.min(Math.max(8, cur.x), maxX);
      const ny = Math.min(Math.max(8, cur.y), maxY);

      if (nx !== cur.x || ny !== cur.y) {
        useOverlayStore.getState().setPosition({ x: nx, y: ny });
      }
    };

    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [isMinimalMode, overlayWidth, overlayHeight, isProctorSafe]);

  if (!isMounted || !overlayRoot) return null;

  // ───────────────────────────────────────────────────────────────
  // Overlay content
  // ───────────────────────────────────────────────────────────────

  const overlayContent = (
    <div
      ref={resizeContainerRef}
      className={cn(
        "overlay-panel no-select relative flex flex-col gap-0",
        isMinimalMode ? "rounded-full" : "rounded-2xl overflow-hidden",
        "border border-white/10",
        "bg-[#0b0b18] backdrop-blur-2xl",
        "shadow-[0_12px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.05)]",
        "transition-all duration-200",
        isStealthMode && "overlay-stealth-glass",
        isProctorSafe && "overlay-proctor-safe",
        shouldShow
          ? "opacity-100 pointer-events-auto translate-y-0"
          : "opacity-0 pointer-events-none -translate-y-2"
      )}
      style={{
        width: isMinimalMode ? pillWidth : isMobile ? "100%" : overlayWidth,
        height: isMinimalMode ? "auto" : isMobile ? "60vh" : overlayHeight,
        opacity: effectiveOpacity,
        pointerEvents: shouldShow ? "auto" : "none",
      }}
      role="dialog"
      aria-label="Clarify AI Overlay"
      aria-hidden={shouldShow ? undefined : true}
      {...(!shouldShow ? ({ inert: "" } as const) : {})}
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent pointer-events-none" />

      {/* HEADER — drag strip only */}
      <div
        data-drag-handle
        className={cn(
          "flex cursor-grab items-center gap-2 px-3 py-2 shrink-0 active:cursor-grabbing",
          "border-b border-white/[0.07]",
          "bg-gradient-to-r from-[#0d0d1e]/80 via-[#0e0e1c]/60 to-[#0d0d1e]/80",
          isMobile && "py-3"
        )}
        title="Drag to move"
        onDoubleClick={() => {
          if (isPeekActive && !isVisible && useOverlayStore.getState().toggleMinimize) {
            useOverlayStore.getState().toggleMinimize();
            return;
          }
          useOverlayStore.getState().setMinimalMode(!isMinimalMode);
        }}
      >
        <div className="flex items-center gap-2 shrink-0 min-w-0 flex-1">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-[12px] font-bold tracking-wide text-white/90 select-none truncate">
            Clarify AI
          </span>

          {isRecording && (
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]"
                title="Recording"
              />
              <span className="text-[10px] font-mono text-red-400/70">LIVE</span>
            </div>
          )}

          <OverlayNetworkBadge color={networkColor} />

          {isStealthMode && (
            <span
              className="font-mono text-[9px] font-bold text-violet-300 bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 rounded shrink-0"
              title="Discrete UI — lower opacity until hover; still visible on screen share"
            >
              DISCRETE
            </span>
          )}
          {isProctorSafe && (
            <span
              className="font-mono text-[9px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0"
              title="Corner-snap layout preset"
            >
              CORNER
            </span>
          )}

          <OverlayAudioBadge />
          <OverlayAnswerTimer />
        </div>
      </div>

      {/* TOOLBAR — separate row so drag handle does not capture button clicks */}
      <div className="shrink-0 border-b border-white/[0.05]" data-no-drag>
        <OverlayToolbar
          onToggleMic={onToggleMic}
          onToggleSystemAudio={onToggleSystemAudio}
          onGenerate={onGenerate}
          onEndSession={onEndSession}
          onSetupNewSession={onSetupNewSession}
        />
      </div>

      {/* BODY */}
      {!isMinimalMode && (
        <>
          {/* Peek-only helper banner */}
          {isPeekActive && !isVisible ? (
            <div className="px-3 py-2 text-[11px] text-white/60 select-none flex items-center justify-between gap-3">
              <span className="truncate">Peek active — press hotkey to open</span>
              {useOverlayStore.getState().toggleMinimize && (
                <button
                  onClick={() => useOverlayStore.getState().toggleMinimize()}
                  className="shrink-0 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 transition-colors border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/15 px-2.5 py-1 rounded-lg"
                >
                  Restore
                </button>
              )}
            </div>
          ) : (
            <>
              <OverlayComplianceBanner compact={isMobile} />
              <ScreenCaptureBanner />

              {isPanicVisible && panicContent ? (
                <div className="p-3 bg-amber-500/10 border-b border-amber-500/15 shrink-0">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-[13px]">🫁</span>
                    <p className="text-xs font-bold text-amber-300">
                      Take a breath — you&apos;ve got this
                    </p>
                  </div>
                  <ol className="space-y-1.5 text-xs text-white/70 leading-relaxed">
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold">1.</span>
                      {panicContent.step_1}
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold">2.</span>
                      {panicContent.step_2}
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400 font-bold">3.</span>
                      {panicContent.step_3}
                    </li>
                  </ol>
                  <button
                    onClick={() => useOverlayStore.getState().hidePanic()}
                    className={cn(
                      "mt-2.5 text-[11px] font-semibold text-amber-300 hover:text-amber-200 transition-colors",
                      "border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1 rounded-lg",
                      isMobile && "px-4 py-2 text-xs"
                    )}
                  >
                    I&apos;m ready — continue →
                  </button>
                </div>
              ) : (
                <>
                  {streamError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/15 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                      <span className="text-[11px] text-red-400 truncate flex-1">
                        {streamError.message}
                        {streamError.suggestion ? ` — ${streamError.suggestion}` : ""}
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

                  {isSessionActive && currentQuestion && (
                    <OverlayQuestionBar question={currentQuestion} />
                  )}
                  {isSessionActive && <OverlayQuestionPreview />}

                  <OverlayTabBar />

                  <div
                    className={cn(
                      "min-h-0",
                      activeTab === "chat"
                        ? "flex-1 flex flex-col"
                        : "overflow-y-auto flex-1"
                    )}
                  >
                    {activeTab === "answer" && (
                      <OverlayHintPanel
                        text={displayText}
                        hintStyle={hintStyle}
                        hintState={hintState}
                        errorMessage={errorMessage}
                        screenshotHint={screenshotHint}
                        isScreenshotLoading={isScreenshotLoading}
                      />
                    )}

                    {activeTab === "chat" && onManualQuestion && (
                      <OverlayChatPanel onSubmit={onManualQuestion} />
                    )}

                    {activeTab === "transcript" && (
                      <div className="p-3">
                        <LiveTranscriptStream />
                      </div>
                    )}

                    {activeTab === "resume" && <OverlayResumePanel />}
                    {activeTab === "audit" && <OverlayAuditPanel />}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {isSessionActive && !isMinimalMode && <OverlaySessionStats />}

      {isSessionActive && !isMinimalMode && (
        <div className="flex items-center justify-between border-t border-white/[0.04] px-3 py-1 shrink-0">
          <span className="font-mono text-[10px] text-white/15 truncate select-none">
            ⌃⇧H · Esc · ⌃⇧P
          </span>
          <span className="text-[10px] text-white/20 capitalize shrink-0">
            {String(hintStyle).replace("_", " ")}
          </span>
        </div>
      )}

      {!isMobile && (
        <div
          className={cn(isStealthMode && "opacity-50 hover:opacity-80 transition-opacity")}
          style={{ pointerEvents: "auto" }}
        >
          <OverlayResizeHandles containerRef={resizeContainerRef} />
        </div>
      )}

      <OverlayHotkeyHelp />
    </div>
  );

  // MOBILE: fixed bottom sheet
  if (isMobile) {
    return createPortal(
      <StealthMouseGuard
        isActive={isStealthMode}
        interactive={shouldShow}
        stealthOpacity={guardStealthOpacity}
      >
        <div
          ref={panelRef}
          className={cn(
            "fixed inset-x-0 bottom-0 z-overlay transition-all duration-200 pb-[env(safe-area-inset-bottom)]",
            shouldShow ? "translate-y-0" : "translate-y-full"
          )}
          style={{ pointerEvents: shouldShow ? "auto" : "none" }}
        >
          {overlayContent}
        </div>
      </StealthMouseGuard>,
      overlayRoot
    );
  }

  // DESKTOP: floating draggable window
  return createPortal(
    <StealthMouseGuard
      isActive={isStealthMode}
      stealthOpacity={guardStealthOpacity}
    >
      <OverlayPositionManager
        ref={panelRef}
        position={position}
        onPositionChange={handlePositionChange}
        isProctorSafe={isProctorSafe}
        overlayWidth={overlayWidth}
        overlayHeight={overlayHeight}
      >
        {overlayContent}
      </OverlayPositionManager>
    </StealthMouseGuard>,
    overlayRoot
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

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

function ScreenCaptureBanner() {
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

  if (dismissed || !detected) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/15 shrink-0"
    >
      <span className="text-[11px] flex-1 text-amber-400 leading-snug">
        {detected === "recording" ? "Screen recording" : "Screen sharing"} detected. Your
        overlay remains visible to others — use only for authorized practice or productivity.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss screen capture notice"
        className="text-amber-400/40 hover:text-amber-400 text-[10px] shrink-0 transition-colors px-1"
      >
        ✕
      </button>
    </div>
  );
}
