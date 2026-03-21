// @ts-nocheck
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useAuth } from "@/hooks/useAuth";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import { composeHint, truncateForStealth } from "@/lib/overlay/overlayCompositor";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import { useOverlayStore } from "@/store/overlayStore";
import {
  Mic, MicOff, Wifi, WifiOff, Eye, EyeOff,
  Maximize2, Minimize2, ChevronDown, Type,
  AlertCircle, Loader2, X, Send, Keyboard,
  RefreshCw, Zap, Shield, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// LiveCopilot
// Full live interview co-pilot page.
// The draggable overlay is rendered here; hotkeys are active.
// ─────────────────────────────────────────────────────────────────

export default function LiveCopilot() {
  const navigate     = useNavigate();
  const { profile }  = useAuth();
  const overlayRef   = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"setup" | "active">("setup");
  const [config, setConfig] = useState<Partial<LiveSessionConfig>>({
    interview_type:      "behavioral",
    enable_system_audio: false,
    mic_device_id:       null,
  });
  const [manualQuestion, setManualQuestion] = useState("");
  const [showHotkeyHelp, setShowHotkeyHelp] = useState(false);

  // Individual selectors — prevents global re-renders on every store tick
  const current_hint_text  = useOverlayStore((s) => s.current_hint_text);
  const hint_state         = useOverlayStore((s) => s.hint_state);
  const is_visible         = useOverlayStore((s) => s.is_visible);
  const is_stealth_mode    = useOverlayStore((s) => s.is_stealth_mode);
  const position           = useOverlayStore((s) => s.position);
  const overlayError       = useOverlayStore((s) => s.error);
  const is_panic_visible   = useOverlayStore((s) => s.is_panic_visible);
  const network      = useNetworkMonitor();

  const copilot = useLiveCopilot({
    config:     config as LiveSessionConfig,
    overlayRef,
  });

  // ── Setup phase ───────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium mb-4">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              Live Co-pilot
            </div>
            <h1 className="text-3xl font-bold text-white">
              Real-Time Interview Assistance
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              ConfideQ listens, detects questions, and surfaces hints — invisibly.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">

            {/* Interview type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Interview Type
              </label>
              <select
                value={config.interview_type}
                onChange={(e) => setConfig((c) => ({ ...c, interview_type: e.target.value as any }))}
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500"
              >
                <option value="behavioral">Behavioural</option>
                <option value="technical">Technical</option>
                <option value="system_design">System Design</option>
                <option value="coding">Coding</option>
                <option value="hr">HR / Culture fit</option>
              </select>
            </div>

            {/* System audio toggle */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enable_system_audio}
                onChange={(e) => setConfig((c) => ({ ...c, enable_system_audio: e.target.checked }))}
                className="mt-0.5 rounded border-white/20 bg-white/5 text-emerald-500"
              />
              <div>
                <p className="text-sm font-medium text-white">
                  Capture Interviewer Audio
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Requires sharing your screen + checking "Share audio" (Chrome/Edge only).
                  Improves auto-detection of questions.
                </p>
              </div>
            </label>

            {/* Hotkey summary */}
            <div className="bg-black/30 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Hotkeys
              </p>
              {[
                { keys: ["ctrl", "shift", "h"], label: "Toggle overlay" },
                { keys: ["ctrl", "shift", "s"], label: "Stealth mode" },
                { keys: ["ctrl", "shift", "c"], label: "Screenshot + analyse" },
                { keys: ["ctrl", "shift", "p"], label: "Panic button" },
                { keys: ["escape"],             label: "Clear hint" },
              ].map((hk) => (
                <div key={hk.label} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{hk.label}</span>
                  <kbd className="px-2 py-0.5 bg-white/10 rounded text-gray-300 font-mono">
                    {formatHotkeyLabel(hk.keys)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={async () => {
              setPhase("active");
              await copilot.startLiveSession();
            }}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl transition-all"
          >
            Start Live Co-pilot
          </button>
        </div>
      </div>
    );
  }

  // ── Active phase — full overlay UI ────────────────────────────

  const hintText   = current_hint_text;
  const hintState  = hint_state;
  const isVisible  = is_visible;
  const isStealth  = is_stealth_mode;
  const composed   = hintText
    ? composeHint(hintText, profile?.hint_style ?? "short_hints")
    : null;
  const displayLines = isStealth && composed
    ? truncateForStealth(composed.lines)
    : composed?.lines ?? [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">

      {/* ── Status bar (top of page) ────────────────── */}
      <div className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur border-b border-white/10 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          {/* Left: status indicators */}
          <div className="flex items-center gap-4">
            {/* Mic */}
            <StatusPill
              active={copilot.isCapturing}
              icon={copilot.isMuted ? MicOff : Mic}
              label={copilot.isMuted ? "Muted" : "Listening"}
              color={copilot.isMuted ? "yellow" : "green"}
              onClick={copilot.toggleMute}
            />

            {/* Deepgram */}
            <StatusPill
              active={copilot.deepgramStatus === "connected"}
              icon={Zap}
              label={copilot.deepgramStatus === "connected"
                ? "STT Active"
                : copilot.deepgramStatus === "reconnecting"
                ? "Reconnecting…"
                : "STT Off"}
              color={copilot.deepgramStatus === "connected" ? "green" :
                     copilot.deepgramStatus === "reconnecting" ? "yellow" : "red"}
            />

            {/* Network */}
            <StatusPill
              active={network.mode !== "offline"}
              icon={network.mode === "offline" ? WifiOff : Wifi}
              label={network.qualityLabel}
              color={network.overlayColor}
            />
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHotkeyHelp((v) => !v)}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
              title="Keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              onClick={copilot.toggleProctorSafe}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
              title="Proctor-safe position"
            >
              <Shield className="w-4 h-4" />
            </button>
            <button
              onClick={async () => {
                await copilot.endLiveSession();
                navigate("/dashboard");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 text-sm rounded-lg transition-all"
            >
              <X className="w-3.5 h-3.5" />
              End Session
            </button>
          </div>
        </div>
      </div>

      {/* ── Hotkey help panel ───────────────────────── */}
      {showHotkeyHelp && (
        <div className="fixed top-16 right-4 z-50 bg-[#12121a] border border-white/10 rounded-xl p-4 shadow-2xl w-72">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">Keyboard Shortcuts</span>
            <button onClick={() => setShowHotkeyHelp(false)}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="space-y-2">
            {copilot.hotkeyHelp.map((hk) => (
              <div key={hk.label} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{hk.description}</span>
                <kbd className="text-xs px-2 py-0.5 bg-white/10 rounded font-mono text-gray-300">
                  {hk.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Manual question input ────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <div className="flex gap-2">
          <input
            value={manualQuestion}
            onChange={(e) => setManualQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualQuestion.trim()) {
                copilot.submitManualQuestion(manualQuestion.trim());
                setManualQuestion("");
              }
            }}
            placeholder="Or type a question manually for instant hint…"
            className="flex-1 bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
          />
          <button
            onClick={() => {
              if (manualQuestion.trim()) {
                copilot.submitManualQuestion(manualQuestion.trim());
                setManualQuestion("");
              }
            }}
            disabled={!manualQuestion.trim()}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Auto-detection is active. Manual input overrides auto-detect.
        </p>
      </div>

      {/* ── Draggable Overlay ────────────────────────── */}
      {isVisible && (
        <div
          ref={overlayRef}
          style={{
            position: "fixed",
            left:     position.x,
            top:      position.y,
            zIndex:   9999,
            width:    isStealth ? 240 : 400,
          }}
          className={cn(
            "rounded-xl border shadow-2xl transition-all duration-200",
            isStealth
              ? "bg-black/70 border-white/10"
              : "bg-[#12121a]/95 border-white/15 backdrop-blur"
          )}
        >
          {/* Drag handle */}
          <div
            data-drag-handle
            className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                hintState === "generating" ? "bg-yellow-400 animate-pulse" :
                hintState === "ready"      ? "bg-green-400" :
                hintState === "error"      ? "bg-red-400" :
                                             "bg-gray-600"
              )} />
              <span className="text-xs text-gray-400 font-medium">
                {isStealth ? "CQ" : "ConfideQ Co-pilot"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => useOverlayStore.getState().setStealthMode(!isStealth)}
                className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors"
              >
                {isStealth ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>
              <button
                onClick={() => useOverlayStore.getState().hideOverlay()}
                className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Hint content */}
          <div className="px-3 py-2.5 max-h-64 overflow-y-auto">
            {hintState === "generating" && !hintText && (
              <div className="flex items-center gap-2 text-xs text-violet-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analysing question…
              </div>
            )}
            {hintText && displayLines.length > 0 && (
              <div className="space-y-1 text-xs text-gray-200">
                {displayLines.map((line: any, i: number) => {
                  if (line.type === "blank")   return <div key={i} className="h-1.5" />;
                  if (line.type === "header")  return <p key={i} className="font-semibold text-white text-sm">{line.content}</p>;
                  if (line.type === "code")    return <code key={i} className="block bg-black/50 rounded px-2 py-0.5 font-mono text-green-300">{line.content}</code>;
                  if (line.type === "bullet")  return <div key={i} className="flex gap-1.5"><span className="text-violet-400">•</span><span>{line.content}</span></div>;
                  if (line.type === "keyword") return <span key={i} className="inline-block px-1.5 py-0.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 rounded mr-1 mb-1">{line.content}</span>;
                  return <p key={i} className={cn(line.bold && "font-semibold text-white")}>{line.content}</p>;
                })}
              </div>
            )}
            {overlayError && (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {overlayError}
              </div>
            )}
            {!hintText && hintState === "idle" && (
              <p className="text-xs text-gray-500 italic">
                Waiting for interviewer question…
              </p>
            )}
          </div>

          {/* Panic overlay */}
          {is_panic_visible && (
            <div className="absolute inset-0 bg-black/90 rounded-xl flex flex-col items-center justify-center p-4 text-center">
              <p className="text-sm font-semibold text-white mb-2">🧘 Take a breath</p>
              <ul className="text-xs text-gray-300 space-y-1 text-left">
                <li>1. Inhale 4 counts, hold 4, exhale 4</li>
                <li>2. Say "Let me take a moment to think"</li>
                <li>3. Recall your strongest example</li>
              </ul>
              <button
                onClick={() => useOverlayStore.getState().hidePanic()}
                className="mt-3 text-xs text-violet-400 hover:text-violet-300"
              >
                I'm ready — continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* Level-metre bar */}
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

// ─────────────────────────────────────────────────────────────────
// StatusPill
// ─────────────────────────────────────────────────────────────────

function StatusPill({
  active, icon: Icon, label, color, onClick,
}: {
  active: boolean; icon: any; label: string;
  color: "green" | "yellow" | "red"; onClick?: () => void;
}) {
  const colorMap = {
    green:  "bg-green-500/10 text-green-400 border-green-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    red:    "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all",
        colorMap[color],
        onClick && "hover:opacity-80 cursor-pointer"
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
