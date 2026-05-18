// src/pages/app/live/LiveOverlay.tsx — PRODUCTION READY
import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";

import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAuthStore } from "@/store/userStore";

import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { ScreenCaptureBlocker } from "@/components/overlay/ScreenCaptureBlocker";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import { Button } from "@/components/ui/Button";

import { getOrCreateSession } from "@/lib/session/sessionLifecycle";
import { toDbModel } from "@/lib/ai/modelMapping";

import { ClipboardCheck, AlertTriangle, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

const DEFAULT_CONFIG: LiveSessionConfig = {
  company: null,
  role: null,
  hint_style: "short_hints",
  model: "gemini-flash",
  smart_routing: false,
  stealth_mode: true,
  resume_id: null,
  jd_id: null,
  interview_type: "behavioral",
  instructions: "",
  enable_system_audio: false,
};

export default function LiveOverlay() {
  const profile = useAuthStore((s) => s.profile);
  const sessionStatus = useSessionStore((s) => s.status);

  const [phase, setPhase] = useState<"setup" | "starting" | "active">("setup");
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_CONFIG);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [preparedSessionId, setPreparedSessionId] = useState<string | null>(null);

  const hasStartedRef = useRef(false);
  const didEndRef = useRef(false);
  const isPreparingSessionRef = useRef(false);

  const copilot = useLiveCopilot({
    config,
    sessionType: "live",
    existingSessionId: preparedSessionId,
  });

  const isActive = sessionStatus === "active";
  const isPaused = sessionStatus === "paused"; // safe if you add pause later
  const overlayVisible = useOverlayStore((s) => s.is_visible);

  // Stable ref for cleanup
  const endSessionRef = useRef(copilot.endLiveSession);
  endSessionRef.current = copilot.endLiveSession;

  // Normalize stream error to a message
  const streamError = copilot.streamError;
  const streamErrorMessage: string | null = streamError
    ? typeof streamError === "string"
      ? streamError
      : (streamError as { message?: string }).message ??
        "Microphone stream error. Please check your audio settings."
    : null;

  // ── Setup ────────────────────────────────────────────────────────────────
  const handleSetup = useCallback((sessionConfig: LiveSessionConfig) => {
    useSessionStore.getState().resetSession();
    useOverlayStore.getState().resetSessionState();

    // Ensure both stealth + proctor-safe are updated from config
    useOverlayStore.getState().setStealthMode(!!sessionConfig.stealth_mode);
    useOverlayStore.getState().setProctorSafe(!!sessionConfig.stealth_mode);

    useOverlayStore.getState().setActiveModel(sessionConfig.model);
    useOverlayStore.getState().setHintStyle(sessionConfig.hint_style);

    hasStartedRef.current = false;
    didEndRef.current = false;
    isPreparingSessionRef.current = false;

    setLastSessionId(null);
    setPreparedSessionId(null);
    setConfig(sessionConfig);
    setPhase("starting");
  }, []);

  // ── Prepare DB session then start live session ───────────────────────────
  useEffect(() => {
    if (phase !== "starting" || hasStartedRef.current) return;

    if (!profile?.id) {
      toast.error("Please sign in to start a live session.");
      setPhase("setup");
      return;
    }

    // 1) Prepare session record first (best-effort reuse)
    if (!preparedSessionId) {
      if (isPreparingSessionRef.current) return;
      isPreparingSessionRef.current = true;

      getOrCreateSession({
        user_id: profile.id,
        type: "live",
        title: config.company ? `Live — ${config.company}` : "Live co-pilot",
        document_id: config.resume_id ?? null,
        jd_id: config.jd_id ?? null,
        model_used: toDbModel(config.model) as any,
      })
        .then(({ session, reused }) => {
          setPreparedSessionId(session.id);
          if (reused) toast.message("Resuming your in-progress live session");
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to prepare live session";
          toast.error(message);
          setPhase("setup");
        })
        .finally(() => {
          isPreparingSessionRef.current = false;
        });

      return;
    }

    // 2) Now start live session exactly once
    hasStartedRef.current = true;

    copilot
      .startLiveSession()
      .then(() => {
        setPhase("active");
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to start live session";
        toast.error(message);
        hasStartedRef.current = false;
        useSessionStore.getState().resetSession();
        useOverlayStore.getState().hideOverlay();
        setPhase("setup");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, profile?.id, preparedSessionId, config]);

  // Ensure overlay is visible in active phase by default
  useEffect(() => {
    if (phase !== "active") return;
    useOverlayStore.getState().showOverlay();
  }, [phase]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (hasStartedRef.current && !didEndRef.current) {
        endSessionRef.current();
      }
      useOverlayStore.getState().hideOverlay();
      useOverlayStore.getState().resetSessionState();
    };
  }, []);

  // ── Stop session ─────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    didEndRef.current = true;

    // Snapshot session_id BEFORE ending — endLiveSession may clear store state
    const sessionId = useSessionStore.getState().session_id;

    await copilot.endLiveSession();
    setLastSessionId(sessionId);
  }, [copilot]);

  // ── Generate hint ─────────────────────────────────────────────────────────
  const handleGenerate = useCallback(() => {
    const question = useOverlayStore.getState().current_question;
    if (question) copilot.requestLiveHint(question);
    else toast.info("Speak a question or type one in Chat first");
  }, [copilot]);

  const handleManualQuestion = useCallback(
    (question: string) => copilot.submitManualQuestion(question),
    [copilot]
  );

  // ── Setup screen ─────────────────────────────────────────────────────────
  if (phase === "setup") {
    return <PreSessionSetupWizard onStart={handleSetup} sessionType="live" />;
  }

  if (phase === "starting") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Starting live co-pilot…</p>
      </div>
    );
  }

  // ── Active / ended screen ────────────────────────────────────────────────
  return (
    <>
      <ScreenCaptureBlocker isActive={isActive} />
      <LiveSessionController isActive={isActive} onAutoEnd={handleStop} />

      {/* Enable hotkeys when active (and safe if you later allow paused) */}
      <OverlayKeyboardHandler enabled={isActive || isPaused} onToggleMute={copilot.toggleMute} />

      <OverlayWindow
        onToggleMic={copilot.toggleMute}
        onToggleSystemAudio={copilot.toggleSystemAudio}
        onGenerate={handleGenerate}
        onEndSession={handleStop}
        onManualQuestion={handleManualQuestion}
        onStartSession={handleSetup}
        onSetupNewSession={() => setPhase("setup")}
        lastSessionId={lastSessionId}
      />

      {/* Recovery pill — visible when overlay is hidden during an active/paused session */}
      {(isActive || isPaused) && !overlayVisible && (
        <button
          onClick={() => useOverlayStore.getState().showOverlay()}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90 transition-opacity"
        >
          <Eye className="w-4 h-4" />
          Show Overlay
        </button>
      )}

      {/* Stream error banner */}
      {streamErrorMessage && (
        <div className="mx-auto max-w-md mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{streamErrorMessage}</span>
        </div>
      )}

      {/* Centre content */}
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          {isActive ? (
            <>
              <p className="text-lg font-semibold text-foreground">Overlay Mode Active</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                The overlay is floating on your screen. Use{" "}
                <kbd className="hotkey-badge">Ctrl+Shift+H</kbd> to toggle visibility/minimize.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Press <kbd className="hotkey-badge">Ctrl+Shift+P</kbd> for panic mode
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-foreground">Session Ended</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Review your results or start a new session.
              </p>
              <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
                {lastSessionId && (
                  <Link
                    to={`/app/scorecard/${lastSessionId}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 text-sm font-medium rounded-xl transition-all"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    View Scorecard
                  </Link>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  onClick={() => setPhase("setup")}
                >
                  Start New Session
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
``
