// src/components/overlay/OverlayWindow.tsx
import { createPortal } from "react-dom";
import {───────import { useRef, useCallback, useState, useEffect, useMemo } from "react";
  const pipDoc = useDocumentPiP(false);
  const targetDoc = pipDoc ?? (typeof document !== "undefined" ? document : null);

  useEffect(() => {
    useOverlayStore.getState().setPipActive(!!pipDoc);
    return () => useOverlayStore.getState().setPipActive(false);
  }, [pipDoc]);

  // ── Resolve portal mount node ───────────────────────────────────
  const overlayRoot = useMemo<HTMLElement | null>(() => {
    if (!targetDoc) return null;
    return ensureOverlayRoot(targetDoc);
  }, [targetDoc]);

  // ── Visibility is now CSS-driven (minimize uses peek) ───────────
  const shouldShow = is_visible || is_peek_active;
  const displayText = hint_state === "streaming" ? streaming_buffer : current_hint;

  // ✅ Respect real stealth opacity, but only when visible
  const effectiveOpacity = !shouldShow
    ? 0
    : is_stealth_mode
      ? Math.max(0.2, Math.min(1, stealth_opacity / 100))
      : 1;

  // Parakeet-style compact pill width when minimal
  const pillWidth = isMobile ? "100%" : Math.min(640, Math.max(420, overlay_width));

  useEffect(() => {
    if (!overlayRoot || !shouldShow) return;
    overlayRoot.style.display = "";
    overlayRoot.style.opacity = "1";
    overlayRoot.style.visibility = "visible";
  }, [overlayRoot, shouldShow]);

  // Keep pill within viewport bounds on resize so it never gets covered or scrolls off.
  useEffect(() => {
    if (typeof window === "undefined" || is_proctor_safe) return;

    const clamp = () => {
      const w = is_minimal_mode ? Math.min(640, Math.max(420, overlay_width)) : overlay_width;
      const maxX = Math.max(8, window.innerWidth - w - 8);
      const maxY = Math.max(8, window.innerHeight - 60);

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
  }, [is_minimal_mode, overlay_width, is_proctor_safe]);

  if (!isMounted || !overlayRoot) return null;

  // ── Overlay content ─────────────────────────────────────────────
  const overlayContent = (
    <div
      ref={resizeContainerRef}
      className={cn(
        "overlay-panel no-select flex flex-col gap-0 relative overflow-hidden",
        is_minimal_mode ? "rounded-full" : "rounded-2xl",
        "border border-white/10",
        "bg-[#0b0b18] backdrop-blur-2xl",
        "shadow-[0_12px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.05)]",
        "transition-all duration-200",
        is_stealth_mode && "overlay-stealth-glass",
        is_proctor_safe && "overlay-proctor-safe",
        shouldShow
          ? "opacity-100 pointer-events-auto translate-y-0"
          : "opacity-0 pointer-events-none -translate-y-2",
      )}
      style={{
        width: is_minimal_mode ? pillWidth : (isMobile ? "100%" : overlay_width),
        height: is_minimal_mode ? "auto" : (isMobile ? "60vh" : overlay_height),
        opacity: effectiveOpacity,
        pointerEvents: shouldShow ? "auto" : "none", // ✅ ensure clickable
      }}
      role="dialog"
      aria-label="Clarify AI Overlay"
      aria-hidden={!shouldShow}
    >
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent pointer-events-none" />

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div
        data-drag-handle
        className={cn(
          "flex cursor-grab items-center gap-2 px-3 py-2 shrink-0 active:cursor-grabbing",
          "border-b border-white/[0.07]",
          "bg-gradient-to-r from-[#0d0d1e]/80 via-[#0e0e1c]/60 to-[#0d0d1e]/80",
          isMobile && "py-3",
        )}
        title="Drag to move"
        // ✅ If minimized (peek-only), clicking header restores overlay
        onDoubleClick={() => useOverlayStore.getState().toggleMinimize()}
      >
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-[12px] font-bold tracking-wide text-white/90 select-none">
            Clarify AI
          </span>
        </div>

        {isRecording && (
          <div className="flex items-center gap-1 shrink-0">
            <span
              className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]"
              title="Recording"
            />
            <span className="text-[10px] font-mono text-red-400/70">LIVE</span>
          </div>
        )}

        <OverlayNetworkBadge color={network_color} />

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

        <div className="flex-1" />

        <OverlayAudioBadge />
        <OverlayAnswerTimer />

        <OverlayToolbar
          onToggleMic={onToggleMic}
          onToggleSystemAudio={onToggleSystemAudio}
          onGenerate={onGenerate}
          onEndSession={onEndSession}
          onSetupNewSession={onSetupNewSession}
        />
      </div>

      {/* ── BODY (hidden in pill mode) ─────────────────────────── */}
      {!is_minimal_mode && (is_peek_active && !is_visible ? (
        <div className="px-3 py-2 text-[11px] text-white/50 select-none">
          Peek active — press hotkey to open
        </div>
      ) : (
        <>
          <ScreenCaptureBanner isProctorSafe={is_proctor_safe} />

          {is_panic_visible && panic_content && (
            <div className="p-3 bg-amber-500/10 border-b border-amber-500/15 shrink-0">
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
                className={cn(
                  "mt-2.5 text-[11px] font-semibold text-amber-300 hover:text-amber-200 transition-colors",
                  "border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1 rounded-lg",
                  isMobile && "px-4 py-2 text-xs",
                )}
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

              <>
                {isSessionActive && current_question && (
                  <OverlayQuestionBar question={current_question} />
                )}
                {isSessionActive && <OverlayQuestionPreview />}
                <OverlayTabBar />
                <div
                  className={cn(
                    "min-h-0",
                    active_tab === "chat"
                      ? "flex-1 flex flex-col"
                      : "overflow-y-auto flex-1",
                  )}
                >
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
                  {active_tab === "resume" && <OverlayResumePanel />}
                  {active_tab === "audit" && <OverlayAuditPanel />}
                </div>
              </>
            </>
          )}
        </>
      ))}

      {isSessionActive && <OverlaySessionStats />}

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

      {!isMobile && (
        <div
          className={cn(is_stealth_mode && "opacity-50 hover:opacity-80 transition-opacity")}
          style={{ pointerEvents: "auto" }}
        >
          <OverlayResizeHandles containerRef={resizeContainerRef} />
        </div>
      )}

      <OverlayHotkeyHelp />
    </div>
  );

  // Mobile: fixed bottom sheet
  if (isMobile) {
    return createPortal(
      <StealthMouseGuard isActive={is_stealth_mode}>
        <div
          ref={panelRef}
          className={cn(
            "fixed inset-x-0 bottom-0 z-overlay transition-all duration-200",
            shouldShow ? "translate-y-0" : "translate-y-full",
          )}
          style={{ pointerEvents: shouldShow ? "auto" : "none" }}
        >
          {overlayContent}
        </div>
      </StealthMouseGuard>,
      overlayRoot,
    );
  }

  // Desktop: floating draggable window
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
        {overlayContent}
      </OverlayPositionManager>
    </StealthMouseGuard>,
    overlayRoot,
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
        compact ? "py-1.5 text-[11px]" : "py-2.5 text-[13px]",
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
import { useOverlayStore, type OverlayPosition } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
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
import { Loader2, Sparkles } from "lucide-react";
import type { LiveSessionConfig } from "@/types/session.types";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { useDocumentPiP } from "@/lib/overlay/useDocumentPiP";
import { useIsMobile } from "@/hooks/use-mobile";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

// FIX: must match the id used by screenCaptureBlocker.ts and triggerPanicKill()
// so stealth panic-kill correctly hides the portal container in browser mode.
const OVERLAY_ROOT_ID = "clarify-overlay-root";

function ensureOverlayRoot(doc: Document): HTMLElement {
  let el = doc.getElementById(OVERLAY_ROOT_ID);
  if (!el) {
    console.warn(
      `[OverlayWindow] #${OVERLAY_ROOT_ID} not found in DOM — creating it dynamically.`,
    );
    el = doc.createElement("div");
    el.id = OVERLAY_ROOT_ID;
    el.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:9998;isolation:isolate;";
    doc.body.appendChild(el);
  }
  return el;
}

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

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

  // ── Hydration guard ─────────────────────────────────────────────
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const isMobile = useIsMobile();

  // ── Store subscriptions ─────────────────────────────────────────
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
  const profileId = useAuthStore((s) => s.profile?.id ?? null);

  const sessionStatus = useSessionStore((s) => s.status);
  const isSessionActive = sessionStatus === "active";

  const deepgramStatus = useAudioStore((s) => s.deepgram_status);
  const stream_error = useAudioStore((s) => s.streams?.error ?? null);
  const isRecording = deepgramStatus === "connected";
  const isGenerating = hint_state === "generating" || hint_state === "streaming";

  const handlePositionChange = useCallback(
    (pos: OverlayPosition) => {
      useOverlayStore.getState().setPosition(pos);
      if (!profileId) return;

      if (persistPositionTimerRef.current) clearTimeout(persistPositionTimerRef.current);
      persistPositionTimerRef.current = setTimeout(() => {
        void supabase
          .from("profiles")
          .update({ overlay_position: JSON.stringify(pos), updated_at: new Date().toISOString() })
          .eq("id", profileId);
      }, 500);
    },
    [profileId],
  );

  useStealthMouse(panelRef, is_stealth_mode);

