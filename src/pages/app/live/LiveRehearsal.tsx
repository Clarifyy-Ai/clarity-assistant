// src/pages/app/live/LiveRehearsal.tsx — PRODUCTION READY
import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useAudioStore } from "@/store/audioStore";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { ScreenCaptureBlocker } from "@/components/overlay/ScreenCaptureBlocker";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import { Button } from "@/components/ui/Button";
import {
  ClipboardCheck,
  AlertTriangle,
  RefreshCw,
  Eye,
  Sparkles,
  Pause,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

const DEFAULT_CONFIG: LiveSessionConfig = {
  company: null,
  role: null,
  hint_style: "short_hints",
  model: "gemini-flash",
  smart_routing: false,
  stealth_mode: false,
  resume_id: null,
  jd_id: null,
  interview_type: "behavioral",
  instructions: "",
  enable_system_audio: true,
  duration_minutes: 60,
};

export default function LiveRehearsal() {
  const navigate = useNavigate();

  const sessionStatus = useSessionStore((s) => s.status);
  const isVisible = useOverlayStore((s) => s.is_visible);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);

  const [phase, setPhase] = useState<"setup" | "active" | "restarting">("setup");
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_CONFIG);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);

  const hasStartedRef = useRef(false);
  const didEndRef = useRef(false);

  const copilot = useLiveCopilot({ config });
  const isActive = sessionStatus === "active";
  const isPaused = sessionStatus === "paused";

  const endSessionRef = useRef(copilot.endLiveSession);
  endSessionRef.current = copilot.endLiveSession;

  const streamErrorMessage: string | null = streamError
    ? typeof streamError === "string"
      ? streamError
      : (streamError as { message?: string }).message ??
        "Microphone stream error. Please check your audio settings."
    : null;

  const handleSetup = useCallback((sessionConfig: LiveSessionConfig) => {
    useSessionStore.getState().resetSession();
    useOverlayStore.getState().resetSessionState();

    useOverlayStore.getState().setActiveModel(sessionConfig.model);
    useOverlayStore.getState().setHintStyle(sessionConfig.hint_style);

    // ✅ FIX: set both flags from config
    useOverlayStore.getState().setStealthMode(!!sessionConfig.stealth_mode);
    useOverlayStore.getState().setProctorSafe(!!sessionConfig.stealth_mode);

    hasStartedRef.current = false;
    didEndRef.current = false;

    setLastSessionId(null);
    setConfig(sessionConfig);

    setPhase("restarting");
    requestAnimationFrame(() => setPhase("active"));
  }, []);

  useEffect(() => {
    if (phase !== "active" || hasStartedRef.current) return;
    hasStartedRef.current = true;

    useOverlayStore.getState().showOverlay();

    copilot.startLiveSession().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to start live session";
      toast.error(message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => {
      if (hasStartedRef.current && !didEndRef.current) {
        endSessionRef.current();
      }
      useOverlayStore.getState().hideOverlay();
      useOverlayStore.getState().resetSessionState();
    };
  }, []);

  const handleStop = useCallback(async () => {
    didEndRef.current = true;
    const sessionId = useSessionStore.getState().session_id;
    await copilot.endLiveSession();
    setLastSessionId(sessionId);
  }, [copilot]);

  const handleGenerate = useCallback(() => {
    const question = useOverlayStore.getState().current_question;
    if (question) {
      copilot.requestLiveHint(question);
    } else {
      toast.info("Speak a question or type one in Chat first");
    }
  }, [copilot]);

  const handleManualQuestion = useCallback(
    (question: string) => copilot.submitManualQuestion(question),
    [copilot],
  );

  if (phase === "setup") {
    return (
      <>
        <div
          role="note"
          className="mx-auto max-w-2xl mt-4 mb-2 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Practice only.</strong> Live Co-Pilot is designed for interview rehearsal with an
            AI coach. Do not use during real interviews — covert AI assistance violates most
            employer and assessment policies.
          </span>
        </div>
        <PreSessionSetupWizard onStart={handleSetup} sessionType="live" />
      </>
    );
  }

  return (
    <>
      <ScreenCaptureBlocker isActive={isActive} />
      <LiveSessionController isActive={isActive} onAutoEnd={handleStop} />
      <OverlayKeyboardHandler enabled={isActive} onToggleMute={copilot.toggleMute} />

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

      {streamErrorMessage && (
        <div className="mx-auto max-w-md mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{streamErrorMessage}</span>
        </div>
      )}

      {(isActive || isPaused) && !isVisible && (
        <button
          onClick={() => useOverlayStore.getState().showOverlay()}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90 transition-opacity"
        >
          <Eye className="w-4 h-4" />
          Show Overlay
        </button>
      )}

      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3 max-w-md px-4">
          {isActive || isPaused ? (
            <>
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <p className="text-lg font-semibold text-foreground">
                {isPaused ? "Session Paused" : "Overlay Mode Active"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isPaused ? (
                  "Timer and audio are paused. Resume when you're ready."
                ) : (
                  <>
                    The overlay is floating on your screen. Use{" "}
                    <kbd className="hotkey-badge">Ctrl+Shift+H</kbd> to toggle visibility.
                  </>
                )}
              </p>
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                {isPaused ? (
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Play className="w-4 h-4" />}
                    onClick={copilot.resumeLiveSession}
                  >
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Pause className="w-4 h-4" />}
                    onClick={copilot.pauseLiveSession}
                  >
                    Pause
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<ClipboardCheck className="w-4 h-4" />}
                  onClick={handleStop}
                >
                  End Session
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Press <kbd className="hotkey-badge">Ctrl+Shift+P</kbd> for panic mode
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-foreground">Session Ended</p>
              <p className="text-sm text-muted-foreground">
                Review your results or start a new session.
              </p>
              <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
                {lastSessionId && (
                  <Link
                    to={`/app/scorecard/${lastSessionId}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary text-sm font-medium rounded-xl transition-all"
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
