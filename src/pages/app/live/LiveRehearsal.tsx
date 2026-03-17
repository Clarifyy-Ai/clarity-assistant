import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useLiveCopilot } from "@/hooks/useLiveCopilot";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useOverlayVisibility } from "@/hooks/useOverlayVisibility";
import { useCredits } from "@/hooks/useCredits";
import { useSessionContext } from "@/hooks/useSessionContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  Mic, MicOff, Monitor, Play, Square,
  Keyboard, Eye, EyeOff, AlertTriangle,
  Wifi, WifiOff, Zap, Settings,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";

// ─────────────────────────────────────────────────────────────────
// LiveRehearsal
// Main live co-pilot page. Controls session start/stop,
// audio setup, hint style, overlay visibility.
// ─────────────────────────────────────────────────────────────────

const HINT_STYLES = [
  { value: "full_answer",  label: "Full Answer",    icon: "📝" },
  { value: "short_hints",  label: "Short Hints",    icon: "💡" },
  { value: "keywords",     label: "Keywords Only",  icon: "🔑" },
];

export default function LiveRehearsal() {
  const navigate      = useNavigate();
  const copilot       = useLiveCopilot();
  const audio         = useAudioCapture();
  const overlay       = useOverlayVisibility();
  const credits       = useCredits();
  const network       = useNetworkMonitor();
  const sessionCtx    = useSessionContext();

  const [hintStyle,     setHintStyle]     = useState("short_hints");
  const [targetCompany, setTargetCompany] = useState("");
  const [configOpen,    setConfigOpen]    = useState(true);
  const [hotkeysOpen,   setHotkeysOpen]   = useState(false);
  const [micError,      setMicError]      = useState<string | null>(null);

  const isActive = copilot.isSessionActive;

  // ── Start session ─────────────────────────────────────────────

  async function handleStart() {
    if (!credits.canAfford("live_hint")) {
      return;
    }

    const { error } = await audio.startMic();
    if (error) { setMicError(error); return; }

    sessionCtx.initContext({
      target_company:  targetCompany || null,
      session_goals:   [`Using ${hintStyle} hints`],
    });

    await copilot.startSession({ hintStyle, targetCompany });
    setConfigOpen(false);
    overlay.show();
  }

  // ── Stop session ──────────────────────────────────────────────

  async function handleStop() {
    await copilot.endSession();
    audio.stopAll();
    overlay.hide();
    navigate("/app/sessions");
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Live Co-Pilot"
        subtitle="Real-time AI assistance during your actual interview"
        action={
          <div className="flex items-center gap-2">
            <NetworkPill mode={network.mode} rtt={network.rtt} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHotkeysOpen(true)}
              leftIcon={<Keyboard className="w-3.5 h-3.5" />}
            >
              Hotkeys
            </Button>
          </div>
        }
      />

      {/* ── Credit warning ─────────────────────────────── */}
      {credits.isEmpty && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">No credits remaining</p>
            <p className="text-xs text-gray-400 mt-0.5">
              AI generation is paused. All other features still work.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => navigate("/app/settings/billing")}>
            Upgrade
          </Button>
        </div>
      )}

      {/* ── Session config ─────────────────────────────── */}
      {!isActive && (
        <Card>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setConfigOpen((p) => !p)}
          >
            <h3 className="text-sm font-semibold text-white">Session setup</h3>
            {configOpen
              ? <ChevronUp className="w-4 h-4 text-gray-500" />
              : <ChevronDown className="w-4 h-4 text-gray-500" />
            }
          </div>

          {configOpen && (
            <div className="mt-5 space-y-5">
              {/* Hint style */}
              <div>
                <p className="text-xs font-medium text-gray-300 mb-2">Hint style</p>
                <div className="grid grid-cols-3 gap-2">
                  {HINT_STYLES.map((h) => (
                    <button
                      key={h.value}
                      onClick={() => setHintStyle(h.value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all",
                        hintStyle === h.value
                          ? "bg-violet-600/20 border-violet-500/40 text-violet-200"
                          : "bg-white/3 border-white/10 text-gray-400 hover:border-white/20"
                      )}
                    >
                      <span className="text-lg">{h.icon}</span>
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target company */}
              <div>
                <p className="text-xs font-medium text-gray-300 mb-2">
                  Target company <span className="text-gray-600">(optional)</span>
                </p>
                <input
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  placeholder="e.g. Google, Stripe, Notion…"
                  className="w-full bg-black/30 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Audio status */}
              <AudioSetupRow micError={micError} />

              {/* Start button */}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={credits.isEmpty}
                onClick={handleStart}
                leftIcon={<Play className="w-4 h-4" />}
              >
                Start Live Session
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Active session controls ────────────────────── */}
      {isActive && (
        <LiveSessionControls
          copilot={copilot}
          overlay={overlay}
          hintStyle={hintStyle}
          setHintStyle={setHintStyle}
          onStop={handleStop}
        />
      )}

      {/* ── Transcript feed ────────────────────────────── */}
      {isActive && (
        <TranscriptFeed
          transcript={copilot.transcript}
          currentQuestion={copilot.currentQuestion}
        />
      )}

      {/* ── Hotkeys modal ──────────────────────────────── */}
      <HotkeysModal open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function NetworkPill({ mode, rtt }: { mode: string; rtt: number }) {
  return (
    <span className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border",
      mode === "fast"
        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        : mode === "slow"
        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
        : "bg-red-500/10 border-red-500/20 text-red-400"
    )}>
      {mode === "offline"
        ? <WifiOff className="w-3 h-3" />
        : <Wifi className="w-3 h-3" />
      }
      {mode === "offline" ? "Offline" : `${rtt}ms`}
    </span>
  );
}

function AudioSetupRow({ micError }: { micError: string | null }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/8">
      <Mic className="w-4 h-4 text-gray-400 shrink-0" />
      <div className="flex-1">
        <p className="text-xs font-medium text-white">Microphone</p>
        <p className="text-[10px] text-gray-500">
          {micError ?? "Will be requested when you start"}
        </p>
      </div>
      <Monitor className="w-4 h-4 text-gray-600 shrink-0" />
      <div>
        <p className="text-xs font-medium text-gray-400">System audio</p>
        <p className="text-[10px] text-gray-600">Optional</p>
      </div>
    </div>
  );
}

function LiveSessionControls({
  copilot, overlay, hintStyle, setHintStyle, onStop,
}: any) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Status card */}
      <Card className="flex items-center gap-4">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Session active</p>
          <p className="text-xs text-gray-500">{copilot.sessionTimer ?? "00:00"}</p>
        </div>
        <Button variant="danger" size="sm" onClick={onStop} leftIcon={<Square className="w-3.5 h-3.5" />}>
          End
        </Button>
      </Card>

      {/* Overlay toggle */}
      <Card className="flex items-center gap-4">
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center",
          overlay.isVisible ? "bg-violet-600/20" : "bg-white/5"
        )}>
          {overlay.isVisible
            ? <Eye className="w-4 h-4 text-violet-400" />
            : <EyeOff className="w-4 h-4 text-gray-500" />
          }
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Overlay</p>
          <p className="text-[10px] text-gray-500">Ctrl+Shift+H to toggle</p>
        </div>
        <button
          onClick={overlay.toggle}
          className={cn(
            "w-10 h-5 rounded-full border transition-all relative",
            overlay.isVisible
              ? "bg-violet-600 border-violet-500"
              : "bg-white/10 border-white/20"
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
            overlay.isVisible ? "left-5" : "left-0.5"
          )} />
        </button>
      </Card>
    </div>
  );
}

function TranscriptFeed({
  transcript, currentQuestion,
}: {
  transcript: string[];
  currentQuestion: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Live Transcript</h3>
        {currentQuestion && (
          <Badge variant="violet" size="sm">Question detected</Badge>
        )}
      </div>
      {currentQuestion && (
        <div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
          <p className="text-xs text-violet-300 font-medium mb-1">Current question</p>
          <p className="text-sm text-white">{currentQuestion}</p>
        </div>
      )}
      <div className="h-48 overflow-y-auto space-y-1 text-xs text-gray-400 font-mono leading-relaxed">
        {transcript.length === 0 ? (
          <p className="text-gray-600 italic">Waiting for speech…</p>
        ) : (
          transcript.map((line, i) => (
            <p key={i} className="leading-relaxed">{line}</p>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </Card>
  );
}

function HotkeysModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const KEYS = [
    { keys: "Ctrl+Shift+H", action: "Toggle overlay visibility" },
    { keys: "Ctrl+Shift+S", action: "Stealth mode on/off" },
    { keys: "Ctrl+Shift+P", action: "Panic — hide everything" },
    { keys: "Ctrl+Shift+M", action: "Mute/unmute microphone" },
  ];

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-2">
        {KEYS.map((k) => (
          <div key={k.keys} className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
            <span className="text-sm text-gray-300">{k.action}</span>
            <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs font-mono text-gray-300">
              {k.keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
