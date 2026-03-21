// @ts-nocheck
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useOverlayVisibility } from "@/hooks/useOverlayVisibility";
import { useCredits } from "@/hooks/useCredits";
import { useSessionContext } from "@/hooks/useSessionContext";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { LiveTranscriptStream } from "@/components/live/LiveTranscriptStream";
import { LiveAnswerStream } from "@/components/live/LiveAnswerStream";
import { LiveNetworkMonitor } from "@/components/live/LiveNetworkMonitor";
import { LiveHotKeyListener } from "@/components/live/LiveHotKeyListener";
import { LiveSessionTimer } from "@/components/live/LiveSessionTimer";
import { LivePanicButton } from "@/components/live/LivePanicButton";
import { LiveCodingProblemCapture } from "@/components/live/LiveCodingProblemCapture";
import { ScreenCaptureBlocker } from "@/components/overlay/ScreenCaptureBlocker";
import {
  Mic, MicOff, Monitor, Play, Square,
  Keyboard, Eye, EyeOff, AlertTriangle,
  ChevronDown, ChevronUp, Shield, Ghost,
} from "lucide-react";
import { cn } from "@/lib/utils";

const HINT_STYLES = [
  { value: "full_answer",  label: "Full Answer",    icon: "📝" },
  { value: "short_hints",  label: "Short Hints",    icon: "💡" },
  { value: "keywords",     label: "Keywords Only",  icon: "🔑" },
];

export default function LiveRehearsal() {
  const navigate      = useNavigate();
  const audio         = useAudioCapture();
  const overlay       = useOverlayVisibility();
  const credits       = useCredits();
  const network       = useNetworkMonitor();
  const sessionCtx    = useSessionContext();
  // Individual selectors — prevents re-renders from store churn during live sessions
  const sessionStatus      = useSessionStore((s) => s.status);
  const is_proctor_safe    = useOverlayStore((s) => s.is_proctor_safe);
  const is_stealth_mode    = useOverlayStore((s) => s.is_stealth_mode);
  const current_question   = useOverlayStore((s) => s.current_question);

  const [hintStyle,     setHintStyle]     = useState("short_hints");
  const [targetCompany, setTargetCompany] = useState("");
  const [configOpen,    setConfigOpen]    = useState(true);
  const [hotkeysOpen,   setHotkeysOpen]   = useState(false);
  const [micError,      setMicError]      = useState<string | null>(null);

  const isActive = sessionStatus === "active";

  // ── Start session ─────────────────────────────────────────────
  async function handleStart() {
    if (!credits.canAfford("live_hint")) return;

    const { error } = await audio.startMic();
    if (error) { setMicError(error); return; }

    sessionCtx.initContext({
      target_company: targetCompany || null,
      session_goals: [`Using ${hintStyle} hints`],
    });

    const ss = useSessionStore.getState();
    ss.setMode("live");
    ss.setStatus("active");
    ss.setSessionId(crypto.randomUUID());
    useOverlayStore.getState().setHintStyle(hintStyle as any);

    setConfigOpen(false);
    overlay.show();
  }

  // ── Stop session ──────────────────────────────────────────────
  async function handleStop() {
    useSessionStore.getState().setStatus("completed");
    audio.stopAll();
    overlay.hide();
    navigate("/app/sessions");
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Invisible overlay — renders into #overlay-root portal */}
      <OverlayWindow />
      <ScreenCaptureBlocker isActive={isActive} />
      <LiveSessionController isActive={isActive} />
      <LiveHotKeyListener enabled={isActive} onToggleMute={() => audio.setMuted(!audio.isMuted)} />

      <PageHeader
        title="Live Co-Pilot"
        subtitle="Real-time AI assistance during your actual interview"
        action={
          <div className="flex items-center gap-2">
            <LiveNetworkMonitor />
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
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">No credits remaining</p>
            <p className="text-xs text-muted-foreground mt-0.5">
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
            <h3 className="text-sm font-semibold text-foreground">Session setup</h3>
            {configOpen
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />
            }
          </div>

          {configOpen && (
            <div className="mt-5 space-y-5">
              {/* Hint style */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Hint style</p>
                <div className="grid grid-cols-3 gap-2">
                  {HINT_STYLES.map((h) => (
                    <button
                      key={h.value}
                      onClick={() => setHintStyle(h.value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all",
                        hintStyle === h.value
                          ? "bg-primary/20 border-primary/40 text-primary"
                          : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/20"
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
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Target company <span className="text-muted-foreground/50">(optional)</span>
                </p>
                <input
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  placeholder="e.g. Google, Stripe, Notion…"
                  className="w-full bg-secondary/30 border border-border text-foreground placeholder-muted-foreground/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* Audio status */}
              <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl border border-border">
                <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">Microphone</p>
                  <p className="text-[10px] text-muted-foreground">
                    {micError ?? "Will be requested when you start"}
                  </p>
                </div>
                <Monitor className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">System audio</p>
                  <p className="text-[10px] text-muted-foreground/50">Optional</p>
                </div>
              </div>

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
        <div className="space-y-4">
          {/* Top controls row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status card */}
            <Card className="flex items-center gap-4">
              <div className="w-3 h-3 bg-destructive rounded-full animate-pulse shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Session active</p>
                <LiveSessionTimer />
              </div>
              <Button variant="danger" size="sm" onClick={handleStop} leftIcon={<Square className="w-3.5 h-3.5" />}>
                End
              </Button>
            </Card>

            {/* Overlay toggle */}
            <Card className="flex items-center gap-4">
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                overlay.isVisible ? "bg-primary/20" : "bg-secondary/30"
              )}>
                {overlay.isVisible
                  ? <Eye className="w-4 h-4 text-primary" />
                  : <EyeOff className="w-4 h-4 text-muted-foreground" />
                }
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Overlay</p>
                <p className="text-[10px] text-muted-foreground">Ctrl+Shift+H to toggle</p>
              </div>
              <button
                onClick={overlay.toggle}
                className={cn(
                  "w-10 h-5 rounded-full border transition-all relative",
                  overlay.isVisible
                    ? "bg-primary border-primary"
                    : "bg-secondary border-border"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-4 h-4 bg-primary-foreground rounded-full transition-all",
                  overlay.isVisible ? "left-5" : "left-0.5"
                )} />
              </button>
            </Card>
          </div>

          {/* Action buttons row */}
          <div className="flex flex-wrap gap-2">
            <LivePanicButton />
            <LiveCodingProblemCapture disabled={!isActive} />
            <button
              onClick={() => audio.setMuted(!audio.isMuted)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all",
                audio.isMuted
                  ? "bg-warning/10 border-warning/20 text-warning"
                  : "bg-secondary/30 border-border text-muted-foreground"
              )}
            >
              {audio.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {audio.isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={() => useOverlayStore.getState().setStealthMode(!is_stealth_mode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all",
                is_stealth_mode
                  ? "bg-violet-500/10 border-violet-500/20 text-violet-400"
                  : "bg-secondary/30 border-border text-muted-foreground"
              )}
            >
              <Ghost className="w-3.5 h-3.5" />
              {is_stealth_mode ? "Stealth On" : "Stealth Off"}
            </button>
            <button
              onClick={() => useOverlayStore.getState().setProctorSafe(!is_proctor_safe)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all",
                is_proctor_safe
                  ? "bg-success/10 border-success/20 text-success"
                  : "bg-secondary/30 border-border text-muted-foreground"
              )}
            >
              <Shield className="w-3.5 h-3.5" />
              Proctor Safe
            </button>
          </div>

          {/* AI Answer stream (in-page view) */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">AI Answer</h3>
              {current_question && (
                <Badge variant="violet" size="sm">Question detected</Badge>
              )}
            </div>
            {current_question && (
              <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                <p className="text-xs text-primary font-medium mb-1">Current question</p>
                <p className="text-sm text-foreground">{current_question}</p>
              </div>
            )}
            <LiveAnswerStream />
          </Card>

          {/* Transcript feed */}
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Live Transcript</h3>
            <LiveTranscriptStream />
          </Card>
        </div>
      )}

      {/* ── Hotkeys modal ──────────────────────────────── */}
      <HotkeysModal open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </div>
  );
}

function HotkeysModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const KEYS = [
    { keys: "Ctrl+Shift+H", action: "Toggle overlay visibility" },
    { keys: "Ctrl+Shift+S", action: "Toggle stealth mode" },
    { keys: "Ctrl+Shift+P", action: "Panic — instant calming steps" },
    { keys: "Ctrl+Shift+M", action: "Mute/unmute microphone" },
    { keys: "Ctrl+Shift+Y", action: "Cycle hint style" },
    { keys: "Ctrl+Shift+C", action: "Capture coding problem" },
    { keys: "Escape",       action: "Clear hint / dismiss panic" },
  ];

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-2">
        {KEYS.map((k) => (
          <div key={k.keys} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-sm text-foreground">{k.action}</span>
            <kbd className="px-2 py-1 bg-secondary border border-border rounded text-xs font-mono text-muted-foreground">
              {k.keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
