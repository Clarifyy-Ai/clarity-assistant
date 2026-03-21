import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useAuth } from "@/hooks/useAuth";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";
import { PreSessionSetup } from "@/components/session/PreSessionSetup";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";

const DEFAULT_CONFIG: LiveSessionConfig = {
  company: null,
  role: null,
  hint_style: "short_hints",
  model: "gemini-flash",
  stealth_mode: true,
  resume_id: null,
  jd_id: null,
  interview_type: "behavioral",
  instructions: "",
  enable_system_audio: false,
};

export default function LiveCopilot() {
  const navigate     = useNavigate();
  const { profile }  = useAuth();
  const overlayRef   = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"setup" | "active">("setup");
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_CONFIG);

  const copilot = useLiveCopilot({
    config,
    overlayRef,
  });

  const isCapturing  = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted      = useAudioStore((s) => s.is_muted);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status);

  const handleStart = useCallback((sessionConfig: LiveSessionConfig) => {
    setConfig(sessionConfig);
    setPhase("active");
  }, []);

  useEffect(() => {
    if (phase === "active") {
      copilot.startLiveSession();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEndSession = useCallback(async () => {
    await copilot.endLiveSession();
    const sessionId = useSessionStore.getState().session_id;
    if (sessionId) {
      navigate(`/app/scorecard/${sessionId}`);
    } else {
      navigate("/dashboard");
    }
  }, [copilot.endLiveSession, navigate]);

  const handleManualQuestion = useCallback((question: string) => {
    copilot.submitManualQuestion(question);
  }, [copilot.submitManualQuestion]);

  if (phase === "setup") {
    return (
      <PreSessionSetup
        onStart={handleStart}
        sessionType="live"
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <LiveSessionController isActive={phase === "active"} />

      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <div className={cn(
              "w-3 h-3 rounded-full",
              isCapturing && !isMuted ? "bg-emerald-400 animate-pulse" : "bg-gray-600"
            )} />
          </div>
          <h2 className="text-xl font-bold text-white">Session Active</h2>
          <p className="text-sm text-gray-400">
            {deepgramStatus === "connected"
              ? "Listening for interview questions…"
              : deepgramStatus === "connecting"
              ? "Connecting to speech recognition…"
              : "The overlay is active. Use hotkeys to control it."}
          </p>
          <div className="space-y-2 text-xs text-gray-500">
            <p><kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono">Ctrl+Shift+H</kbd> Toggle overlay</p>
            <p><kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono">Ctrl+Shift+S</kbd> Stealth mode</p>
            <p><kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono">Ctrl+Shift+P</kbd> Panic button</p>
          </div>
          <button
            onClick={handleEndSession}
            className="mt-4 px-6 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 text-sm rounded-xl transition-all"
          >
            End Session
          </button>
        </div>
      </div>

      <OverlayWindow
        onToggleMic={copilot.toggleMute}
        onGenerate={() => {
          const question = useOverlayStore.getState().current_question;
          if (question) copilot.requestLiveHint(question);
        }}
        onEndSession={handleEndSession}
        onManualQuestion={handleManualQuestion}
      />

      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="max-w-xs mx-auto h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-75",
              copilot.isSpeaking ? "bg-emerald-400" : "bg-white/20"
            )}
            style={{ width: `${Math.min(100, copilot.currentLevel * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
