import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { useAudioStore } from "@/store/audioStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { LiveTranscriptStream } from "@/components/live/LiveTranscriptStream";
import { LiveAnswerStream } from "@/components/live/LiveAnswerStream";
import { LiveNetworkMonitor } from "@/components/live/LiveNetworkMonitor";
import { LiveSessionTimer } from "@/components/live/LiveSessionTimer";
import { LivePanicButton } from "@/components/live/LivePanicButton";
import { LiveCodingProblemCapture } from "@/components/live/LiveCodingProblemCapture";
import { ScreenCaptureBlocker } from "@/components/overlay/ScreenCaptureBlocker";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import {
  Mic, MicOff, Square, Eye, EyeOff,
  AlertTriangle, Shield, Ghost,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

// FIX BUG-1: removed `useCredits` — it was imported and subscribed but its
// return value was never used anywhere in this component.

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

export default function LiveRehearsal() {
  const navigate = useNavigate();

  const sessionStatus    = useSessionStore((s) => s.status);
  const is_proctor_safe  = useOverlayStore((s) => s.is_proctor_safe);
  const is_stealth_mode  = useOverlayStore((s) => s.is_stealth_mode);
  const is_visible       = useOverlayStore((s) => s.is_visible);
  const current_question = useOverlayStore((s) => s.current_question);
  const isCapturing      = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted          = useAudioStore((s) => s.is_muted);
  const streamError      = useAudioStore((s) => s.streams?.error ?? null);
  const deepgramStatus   = useAudioStore((s) => s.deepgram_status);

  const [phase,  setPhase]  = useState<"setup" | "active">("setup");
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_CONFIG);
  const hasStartedRef = useRef(false);

  const copilot  = useLiveCopilot({ config });
  const isActive = sessionStatus === "active";

  const handleSetup = useCallback((sessionConfig: LiveSessionConfig) => {
    useSessionStore.getState().resetSession();
    useOverlayStore.getState().resetSessionState();
    useOverlayStore.getState().setActiveModel(sessionConfig.model);
    useOverlayStore.getState().setHintStyle(sessionConfig.hint_style);
    useOverlayStore.getState().setProctorSafe(sessionConfig.stealth_mode);
    hasStartedRef.current = false;
    setConfig(sessionConfig);
    setPhase("active");
  }, []);

  useEffect(() => {
    if (phase !== "active" || hasStartedRef.current) return;
    hasStartedRef.current = true;
    copilot.startLiveSession().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to start live session";
      toast.error(message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleStop = useCallback(async () => {
    // FIX BUG-3: snapshot session_id BEFORE ending the session.
    // endLiveSession may clear store state, making session_id null by the time
    // we read it after the await.
    const sessionId = useSessionStore.getState().session_id;
    await copilot.endLiveSession();

    if (sessionId) {
      navigate(`/app/scorecard/${sessionId}`);
    } else {
      // FIX BUG-2: surface a toast when session_id is missing rather than
      // silently falling back to the sessions list.
      toast.error("Could not find session ID — redirecting to sessions.");
      navigate("/app/sessions");
    }
  }, [copilot.endLiveSession, navigate]);

  const handleGenerate = useCallback(() => {
    const question = useOverlayStore.getState().current_question;
    if (question) copilot.requestLiveHint(question);
  }, [copilot.requestLiveHint]);

  const handleManualQuestion = useCallback((question: string) => {
    copilot.submitManualQuestion(question);
  }, [copilot.submitManualQuestion]);

  if (phase === "setup") {
    return (
      <PreSessionSetupWizard
        onStart={handleSetup}
        sessionType="live"
      />
    );
  }

  // FIX BUG-4 & BUG-5: normalise currentLevel to [0, 1] before multiplying.
  // The hook may return values in [0, 1] (Web Audio AnalyserNode convention)
  // or [0, 100] depending on implementation. We clamp and normalise here so
  // the bar never maxes out immediately, and use a single signal (currentLevel)
  // to drive both the bar width and its colour so they're always consistent.
  const rawLevel = copilot.currentLevel ?? 0;
  const levelNorm = rawLevel > 1 ? rawLevel / 100 : rawLevel; // normalise to [0,1]
  const levelPct  = Math.min(100, levelNorm * 100);
  const barActive = levelNorm > 0.02; // threshold for "active speaking" colour

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OverlayWindow
        onToggleMic={copilot.toggleMute}
        onToggleSystemAudio={copilot.toggleSystemAudio}
        onGenerate={handleGenerate}
        onEndSession={handleStop}
        onManualQuestion={handleManualQuestion}
      />
      <ScreenCaptureBlocker isActive={isActive} />
      <LiveSessionController isActive={isActive} />
      <OverlayKeyboardHandler
        enabled={isActive}
        onToggleMute={copilot.toggleMute}
      />

      {/* Stream error banner */}
      {streamError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-2xl backdrop-blur-sm max-w-md">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">Audio Error</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {streamError.message} — {streamError.suggestion}
            </p>
          </div>
          {streamError.recoverable && (
            <Button variant="secondary" size="sm" onClick={copilot.reconnectAudio}>
              Reconnect
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-lg space-y-6 p-6">

          {/* Session header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full shrink-0 animate-pulse",
                isCapturing && !isMuted ? "bg-emerald-400" : "bg-red-500",
              )} />
              <div>
                <p className="text-sm font-semibold text-foreground">Session Active</p>
                <p className="text-[10px] text-muted-foreground">
                  {deepgramStatus === "connected"
                    ? (is_stealth_mode
                        ? "Listening for input…"
                        : "Listening for interview questions…")
                    : deepgramStatus === "connecting"
                    ? "Connecting to speech recognition…"
                    : "The overlay is active. Use hotkeys to control it."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LiveNetworkMonitor />
              <Badge variant="violet" size="sm">live</Badge>
            </div>
          </div>

          {/* Controls card */}
          <Card className="!bg-secondary !border-border">
            <div className="flex items-center justify-between mb-3">
              <LiveSessionTimer />
              <button
                onClick={copilot.toggleMute}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                  isMuted
                    ? "bg-warning/10 border-warning/20 text-warning"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                )}
              >
                {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                {isMuted ? "Unmute" : "Mute"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <LivePanicButton />
              <LiveCodingProblemCapture disabled={!isActive} />
              <button
                onClick={toggleAppStealthMode}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                  is_stealth_mode
                    ? "bg-violet-500/10 border-violet-500/20 text-violet-400"
                    : "bg-secondary border-border text-muted-foreground",
                )}
              >
                <Ghost className="w-3 h-3" />
                {is_stealth_mode ? "Stealth On" : "Stealth Off"}
              </button>
              <button
                onClick={() => useOverlayStore.getState().setProctorSafe(!is_proctor_safe)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                  is_proctor_safe
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-secondary border-border text-muted-foreground",
                )}
              >
                <Shield className="w-3 h-3" />
                Proctor Safe
              </button>
              <button
                onClick={() => {
                  const s = useOverlayStore.getState();
                  s.is_visible ? s.hideOverlay() : s.showOverlay();
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                  is_visible
                    ? "bg-primary/10 border-primary/20 text-primary"
                    : "bg-secondary border-border text-muted-foreground",
                )}
              >
                {is_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                Overlay
              </button>
            </div>
          </Card>

          {/* AI answer card */}
          <Card className="!bg-secondary !border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">
                {is_stealth_mode ? "AI Response" : "AI Answer"}
              </h3>
              {current_question && (
                <Badge variant="violet" size="sm">
                  {is_stealth_mode ? "Input detected" : "Question detected"}
                </Badge>
              )}
            </div>
            {current_question && (
              <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                <p className="text-xs text-primary font-medium mb-1">
                  {is_stealth_mode ? "Current input" : "Current question"}
                </p>
                <p className="text-sm text-foreground">{current_question}</p>
              </div>
            )}
            <LiveAnswerStream />
          </Card>

          {/* Transcript card */}
          <Card className="!bg-secondary !border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3">Live Transcript</h3>
            <LiveTranscriptStream />
          </Card>

          {/* End session button */}
          <button
            onClick={handleStop}
            className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Square className="w-3.5 h-3.5" />
            End Session
          </button>

          {/* Hotkey reference */}
          <div className="space-y-1.5 text-center text-xs text-gray-500">
            <p><kbd className="px-1.5 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+H</kbd> Toggle overlay</p>
            <p><kbd className="px-1.5 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+S</kbd> Stealth mode</p>
            <p><kbd className="px-1.5 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+P</kbd> Panic button</p>
            <p><kbd className="px-1.5 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+M</kbd> Mute/unmute</p>
          </div>
        </div>
      </div>

      {/* Audio level bar */}
      {/* FIX BUG-4 & BUG-5: single normalised signal drives both width and colour */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="max-w-xs mx-auto h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-75",
              barActive ? "bg-emerald-400" : "bg-muted-foreground/20",
            )}
            style={{ width: `${levelPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
