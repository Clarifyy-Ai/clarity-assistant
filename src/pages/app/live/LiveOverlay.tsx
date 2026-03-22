import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { ScreenCaptureBlocker } from "@/components/overlay/ScreenCaptureBlocker";
import { PreSessionSetup } from "@/components/session/PreSessionSetup";
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
  const navigate = useNavigate();
  const sessionStatus = useSessionStore((s) => s.status);
  const [phase, setPhase] = useState<"setup" | "active">("setup");
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_CONFIG);
  const hasStartedRef = useRef(false);
  const didEndRef = useRef(false);

  const copilot = useLiveCopilot({ config });
  const isActive = sessionStatus === "active";
  const endSessionRef = useRef(copilot.endLiveSession);
  endSessionRef.current = copilot.endLiveSession;

  const handleSetup = useCallback((sessionConfig: LiveSessionConfig) => {
    useSessionStore.getState().resetSession();
    useOverlayStore.getState().resetSessionState();
    useOverlayStore.getState().setActiveModel(sessionConfig.model);
    useOverlayStore.getState().setHintStyle(sessionConfig.hint_style);
    useOverlayStore.getState().setProctorSafe(sessionConfig.stealth_mode);
    hasStartedRef.current = false;
    didEndRef.current = false;
    setConfig(sessionConfig);
    setPhase("active");
  }, []);

  useEffect(() => {
    if (phase === "active" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      useOverlayStore.getState().showOverlay();
      copilot.startLiveSession();
    }
  }, [phase, copilot.startLiveSession]);

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
    await copilot.endLiveSession();
    const sessionId = useSessionStore.getState().session_id;
    if (sessionId) {
      navigate(`/app/scorecard/${sessionId}`);
    } else {
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
      <PreSessionSetup
        onStart={handleSetup}
        sessionType="live"
      />
    );
  }

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
      />
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">Overlay Mode Active</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            The overlay is floating on your screen. Use <kbd className="hotkey-badge">Ctrl+Shift+H</kbd> to toggle visibility.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Press <kbd className="hotkey-badge">Ctrl+Shift+P</kbd> for panic mode
          </p>
        </div>
      </div>
    </>
  );
}
