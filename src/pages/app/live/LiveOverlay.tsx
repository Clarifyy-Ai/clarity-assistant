import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { ScreenCaptureBlocker } from "@/components/overlay/ScreenCaptureBlocker";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import { Button } from "@/components/ui/Button";
import { ClipboardCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

// FIX BUG-5: removed `useNavigate` — it was imported but never called.

const DEFAULT_CONFIG: LiveSessionConfig = {
  company:             null,
  role:                null,
  hint_style:          "short_hints",
  model:               "gemini-flash",
  smart_routing:       false,
  stealth_mode:        true,
  resume_id:           null,
  jd_id:               null,
  interview_type:      "behavioral",
  instructions:        "",
  enable_system_audio: false,
};

export default function LiveOverlay() {
  const sessionStatus = useSessionStore((s) => s.status);

  const [phase,         setPhase]         = useState<"setup" | "starting" | "active">("setup");
  const [config,        setConfig]        = useState<LiveSessionConfig>(DEFAULT_CONFIG);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);

  const hasStartedRef = useRef(false);
  const didEndRef     = useRef(false);

  const copilot   = useLiveCopilot({ config });
  const isActive  = sessionStatus === "active";

  // Stable ref to endLiveSession so the cleanup effect always calls the latest version
  const endSessionRef     = useRef(copilot.endLiveSession);
  endSessionRef.current   = copilot.endLiveSession;

  // FIX BUG-4: streamError may be Error | { message: string } | string depending
  // on the hook implementation. Normalise to a string for safe rendering.
  const streamError = copilot.streamError;
  const streamErrorMessage: string | null = streamError
    ? (typeof streamError === "string"
        ? streamError
        : (streamError as { message?: string }).message
          ?? "Microphone stream error. Please check your audio settings.")
    : null;

  // ── Setup ────────────────────────────────────────────────────────────────

  const handleSetup = useCallback((sessionConfig: LiveSessionConfig) => {
    useSessionStore.getState().resetSession();
    useOverlayStore.getState().resetSessionState();
    useOverlayStore.getState().setActiveModel(sessionConfig.model);
    useOverlayStore.getState().setHintStyle(sessionConfig.hint_style);
    useOverlayStore.getState().setProctorSafe(sessionConfig.stealth_mode);
    hasStartedRef.current = false;
    didEndRef.current     = false;
    setLastSessionId(null);
    setConfig(sessionConfig);
    setPhase("starting");
  }, []);

  // ── Start session when phase becomes active ──────────────────────────────
  // FIX BUG-2: copilot.startLiveSession may change reference on every render.
  // hasStartedRef guards double-firing, but we also disable the exhaustive-deps
  // lint rule intentionally — copilot.startLiveSession is pulled via getState()
  // inside the hook and is always the latest reference.
  useEffect(() => {
    if (phase !== "starting" || hasStartedRef.current) return;
    hasStartedRef.current = true;
    copilot.startLiveSession().then(() => {
      setPhase("active");
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to start live session";
      toast.error(message);
      hasStartedRef.current = false;
      useSessionStore.getState().resetSession();
      useOverlayStore.getState().hideOverlay();
      setPhase("setup");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (hasStartedRef.current && !didEndRef.current) {
        // FIX BUG-3: call via ref so we always invoke the latest endLiveSession
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
    // FIX BUG-1: do NOT call showOverlay() here. The session is over — showing
    // the overlay again is confusing and contradicts the "Session Ended" UI.
    // The overlay should remain in its last state (hidden or visible).
  }, [copilot.endLiveSession]);

  // ── Generate hint ─────────────────────────────────────────────────────────
  const handleGenerate = useCallback(() => {
    const question = useOverlayStore.getState().current_question;
    if (question) copilot.requestLiveHint(question);
  }, [copilot.requestLiveHint]);

  const handleManualQuestion = useCallback((question: string) => {
    copilot.submitManualQuestion(question);
  }, [copilot.submitManualQuestion]);

  // ── Setup screen ─────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <PreSessionSetupWizard
        onStart={handleSetup}
        sessionType="live"
      />
    );
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
      <LiveSessionController isActive={isActive} />
      <OverlayKeyboardHandler
        enabled={isActive}
        onToggleMute={copilot.toggleMute}
      />
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
                The overlay is floating on your screen.{" "}
                Use <kbd className="hotkey-badge">Ctrl+Shift+H</kbd> to toggle visibility.
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
