import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { useAudioStore } from "@/store/audioStore";
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
  AlertTriangle, Shield, Ghost, Settings,
  Monitor, Globe, MessageSquare, Trash2,
  ChevronDown, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  enable_system_audio: true,
  duration_minutes: 60,
};

export default function LiveRehearsal() {
  const navigate = useNavigate();

  const sessionStatus = useSessionStore((s) => s.status);
  const is_proctor_safe = useOverlayStore((s) => s.is_proctor_safe);
  const is_stealth_mode = useOverlayStore((s) => s.is_stealth_mode);
  const is_visible = useOverlayStore((s) => s.is_visible);
  const current_question = useOverlayStore((s) => s.current_question);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted = useAudioStore((s) => s.is_muted);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status);

  const [phase, setPhase] = useState<"setup" | "active">("setup");
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_CONFIG);
  const hasStartedRef = useRef(false);

  const copilot = useLiveCopilot({ config });
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
    const sessionId = useSessionStore.getState().session_id;
    await copilot.endLiveSession();
    if (sessionId) {
      navigate(`/app/scorecard/${sessionId}`);
    } else {
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

  const rawLevel = copilot.currentLevel ?? 0;
  const levelNorm = rawLevel > 1 ? rawLevel / 100 : rawLevel;
  const levelPct = Math.min(100, levelNorm * 100);
  const barActive = levelNorm > 0.02;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Hidden helpers */}
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl backdrop-blur-sm max-w-md">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">Audio Error</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {streamError.message} — {streamError.suggestion}
            </p>
          </div>
          {streamError.recoverable && (
            <button
              onClick={copilot.reconnectAudio}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-xs font-medium text-white transition-all"
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0d0d14]">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0 animate-pulse",
            isCapturing && !isMuted ? "bg-emerald-400" : "bg-red-500",
          )} />
          <span className="text-sm font-semibold text-white">
            {config.company ? `${config.company}` : "Live Session"}
            {config.role ? ` · ${config.role}` : ""}
          </span>
          <LiveSessionTimer />
        </div>

        <div className="flex items-center gap-2">
          <LiveNetworkMonitor />

          {/* Mic toggle */}
          <button
            onClick={copilot.toggleMute}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              isMuted
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
            )}
          >
            {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            {isMuted ? "Unmute" : "Mute"}
          </button>

          {/* Stealth */}
          <button
            onClick={toggleAppStealthMode}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              is_stealth_mode
                ? "bg-violet-500/10 border-violet-500/20 text-violet-400"
                : "bg-white/5 border-white/10 text-gray-400",
            )}
          >
            <Ghost className="w-3 h-3" />
            Stealth
          </button>

          {/* Proctor Safe */}
          <button
            onClick={() => useOverlayStore.getState().setProctorSafe(!is_proctor_safe)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              is_proctor_safe
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-white/5 border-white/10 text-gray-400",
            )}
          >
            <Shield className="w-3 h-3" />
            Safe
          </button>

          {/* Overlay toggle */}
          <button
            onClick={() => {
              const s = useOverlayStore.getState();
              s.is_visible ? s.hideOverlay() : s.showOverlay();
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              is_visible
                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                : "bg-white/5 border-white/10 text-gray-400",
            )}
          >
            {is_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Overlay
          </button>

          <LivePanicButton />
          <LiveCodingProblemCapture disabled={!isActive} />

          {/* End Session */}
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 text-xs font-medium rounded-lg transition-all"
          >
            <Square className="w-3 h-3" />
            End
          </button>
        </div>
      </header>

      {/* ─── Two-Panel Layout ────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Panel — Transcript */}
        <div className="flex-1 flex flex-col border-r border-white/5 min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-white">Live Transcript</h2>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium",
                deepgramStatus === "connected"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : deepgramStatus === "connecting"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-white/5 text-gray-500"
              )}>
                {deepgramStatus === "connected" ? "Connected" : deepgramStatus === "connecting" ? "Connecting…" : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  /* TODO: clear transcript */
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <LiveTranscriptStream />
          </div>
          {/* Audio level bar */}
          <div className="px-4 py-2 border-t border-white/5">
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-75",
                  barActive ? "bg-emerald-400" : "bg-white/10",
                )}
                style={{ width: `${levelPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Panel — AI Answer */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-white">
                {is_stealth_mode ? "AI Response" : "AI Answer"}
              </h2>
            </div>
            <button
              onClick={handleGenerate}
              disabled={!current_question}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                current_question
                  ? "bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20"
                  : "bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed"
              )}
            >
              <MessageSquare className="w-3 h-3" />
              Generate
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Current question */}
            {current_question && (
              <div className="p-3 bg-violet-500/5 border border-violet-500/15 rounded-xl">
                <p className="text-[10px] uppercase tracking-wider text-violet-400/70 font-semibold mb-1">
                  {is_stealth_mode ? "Detected Input" : "Detected Question"}
                </p>
                <p className="text-sm text-white leading-relaxed">{current_question}</p>
              </div>
            )}

            {/* AI answer stream */}
            <LiveAnswerStream />

            {/* Manual question input */}
            <ManualQuestionInput onSubmit={handleManualQuestion} />
          </div>
        </div>
      </div>

      {/* Hotkey reference */}
      <footer className="flex items-center justify-center gap-6 px-4 py-2 border-t border-white/5 bg-[#0d0d14] text-[10px] text-gray-600">
        <span><kbd className="px-1 py-0.5 bg-white/5 rounded font-mono text-[9px]">Ctrl+Shift+H</kbd> Overlay</span>
        <span><kbd className="px-1 py-0.5 bg-white/5 rounded font-mono text-[9px]">Ctrl+Shift+S</kbd> Stealth</span>
        <span><kbd className="px-1 py-0.5 bg-white/5 rounded font-mono text-[9px]">Ctrl+Shift+P</kbd> Panic</span>
        <span><kbd className="px-1 py-0.5 bg-white/5 rounded font-mono text-[9px]">Ctrl+Shift+M</kbd> Mute</span>
      </footer>
    </div>
  );
}

/* ── Manual question input component ───────────────────────── */
function ManualQuestionInput({ onSubmit }: { onSubmit: (q: string) => void }) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
    setValue("");
  };

  return (
    <div className="flex gap-2 mt-auto pt-4 border-t border-white/5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Type a question manually…"
        className="flex-1 bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-all"
      >
        Ask AI
      </button>
    </div>
  );
}
