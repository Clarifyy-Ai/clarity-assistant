import { useState, useRef, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useAudioStore } from "@/store/audioStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { PANIC_RESPONSE } from "@/types/session.types";
import { captureAndAnalyseCodingProblem } from "@/lib/audio/screenshotCapture";
import {
  Mic, MicOff, Volume2, VolumeX, Zap, RefreshCw,
  Eye, EyeOff, Square, AlertCircle, Type, ChevronDown,
  Minimize2, Star, FileText, Pin, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import type { LucideIcon } from "lucide-react";
import type { PreferredAIModel } from "@/types/user.types";

const MODEL_OPTIONS: { id: PreferredAIModel; label: string; note?: string }[] = [
  { id: "gpt-4o",            label: "GPT-4o",      note: "via Gemini" },
  { id: "claude-3-5-sonnet", label: "Claude",       note: "via Gemini" },
  { id: "gemini-1-5-pro",    label: "Gemini Pro" },
  { id: "gemini-flash",      label: "Flash" },
];

const HINT_STYLE_LABELS: Record<string, string> = {
  full_answer: "Full",
  short_hints: "Short",
  keywords_only: "Keys",
};

const HOTKEY_REFERENCE = [
  { keys: ["ctrl", "shift", "h"], label: "Toggle overlay" },
  { keys: ["ctrl", "shift", "s"], label: "Stealth mode" },
  { keys: ["ctrl", "shift", "y"], label: "Cycle hint style" },
  { keys: ["ctrl", "shift", "c"], label: "Screenshot + analyse" },
  { keys: ["ctrl", "shift", "p"], label: "Panic button" },
  { keys: ["ctrl", "shift", "m"], label: "Mute / unmute" },
  { keys: ["ctrl", "1-4"],       label: "Snap to corner" },
  { keys: ["ctrl", "shift", "esc"], label: "Emergency exit" },
  { keys: ["escape"],             label: "Clear hint" },
];

interface OverlayToolbarProps {
  onToggleMic?: () => void;
  onToggleSystemAudio?: () => void;
  onGenerate?: () => void;
  onEndSession?: () => void;
}

export function OverlayToolbar({ onToggleMic, onToggleSystemAudio, onGenerate, onEndSession }: OverlayToolbarProps) {
  const isMuted           = useAudioStore((s) => s.is_muted);
  const isCapturing       = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystemAudio    = useAudioStore((s) => !!s.streams?.system_stream);
  const isStealth         = useOverlayStore((s) => s.is_stealth_mode);
  const autoGenerate      = useOverlayStore((s) => s.auto_generate);
  const hintState         = useOverlayStore((s) => s.hint_state);
  const hintStyle         = useOverlayStore((s) => s.hint_style);
  const activeModel       = useOverlayStore((s) => s.active_model);
  const isMinimal         = useOverlayStore((s) => s.is_minimal_mode);
  const simpleLanguage    = useOverlayStore((s) => s.simple_language);
  const isScreenshotLoading = useOverlayStore((s) => s.is_screenshot_loading);

  const pinnedHints      = useOverlayStore((s) => s.pinned_hints);
  const resumePoints     = useOverlayStore((s) => s.resume_talking_points);

  const [showModelMenu,       setShowModelMenu]       = useState(false);
  const [showHotkeyRef,       setShowHotkeyRef]       = useState(false);
  const [showPinnedMenu,      setShowPinnedMenu]      = useState(false);
  const [showResumeQuickPeek, setShowResumeQuickPeek] = useState(false);
  const modelMenuRef       = useRef<HTMLDivElement>(null);
  const hotkeyRefRef       = useRef<HTMLDivElement>(null);
  const pinnedMenuRef      = useRef<HTMLDivElement>(null);
  const resumeQuickPeekRef = useRef<HTMLDivElement>(null);

  const isGenerating = hintState === "generating" || hintState === "streaming";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelMenuRef.current       && !modelMenuRef.current.contains(e.target as Node))       setShowModelMenu(false);
      if (hotkeyRefRef.current       && !hotkeyRefRef.current.contains(e.target as Node))       setShowHotkeyRef(false);
      if (pinnedMenuRef.current      && !pinnedMenuRef.current.contains(e.target as Node))      setShowPinnedMenu(false);
      if (resumeQuickPeekRef.current && !resumeQuickPeekRef.current.contains(e.target as Node)) setShowResumeQuickPeek(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5 overflow-x-auto flex-nowrap scrollbar-hide shrink-0">
      <ToolbarButton
        icon={isMuted ? MicOff : Mic}
        label={isMuted ? "Unmute mic" : "Mute mic"}
        active={isCapturing && !isMuted}
        color={isMuted ? "red" : "green"}
        onClick={onToggleMic}
      />

      {onToggleSystemAudio && (
        <ToolbarButton
          icon={hasSystemAudio ? Volume2 : VolumeX}
          label={hasSystemAudio ? "System audio active" : "System audio off"}
          active={hasSystemAudio}
          color={hasSystemAudio ? "emerald" : "gray"}
          onClick={onToggleSystemAudio}
        />
      )}

      <ToolbarButton
        icon={isStealth ? EyeOff : Eye}
        label={isStealth ? "Exit stealth" : "Enter stealth"}
        active={isStealth}
        color={isStealth ? "violet" : "gray"}
        onClick={toggleAppStealthMode}
      />

      <ToolbarButton
        icon={Camera}
        label="Screenshot & analyse coding problem (Ctrl+Shift+C)"
        active={isScreenshotLoading}
        color="blue"
        onClick={() => captureAndAnalyseCodingProblem()}
        disabled={isScreenshotLoading}
      />

      <div className="relative" ref={resumeQuickPeekRef}>
        <button
          onClick={() => setShowResumeQuickPeek((p) => !p)}
          title={resumePoints ? "Resume quick-peek" : "No resume loaded for this session"}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-lg transition-all shrink-0",
            resumePoints
              ? "text-brand-300/60 hover:text-brand-300 hover:bg-white/8"
              : "text-gray-600 opacity-50 hover:opacity-70 hover:bg-white/5",
          )}
        >
          <FileText className="w-3.5 h-3.5" />
        </button>
        {showResumeQuickPeek && (
          <div className="absolute top-full left-0 mt-1 w-60 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-brand-300/60 uppercase tracking-wider">Resume Snapshot</p>
            {!resumePoints ? (
              <p className="text-[11px] text-muted-foreground/50 italic">No resume loaded for this session.</p>
            ) : (
              <>
                <p className="text-[11px] text-overlay-text leading-snug">
                  {resumePoints.intro.length > 120
                    ? resumePoints.intro.slice(0, 119) + "…"
                    : resumePoints.intro}
                </p>
                {resumePoints.skills_summary && (
                  <div className="flex flex-wrap gap-1">
                    {resumePoints.skills_summary.split(", ").slice(0, 3).map((skill, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-brand-500/20 bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-300"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
                {resumePoints.experience_points.slice(0, 2).map((pt, i) => (
                  <div key={i} className="flex gap-1.5 text-[11px] text-overlay-text/70">
                    <span className="shrink-0 text-brand-400">•</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <ToolbarButton
        icon={Zap}
        label="Generate answer"
        active={isGenerating}
        color="amber"
        onClick={onGenerate}
        disabled={isGenerating}
      />

      {/* Auto-generate button */}
      <button
        onClick={() => useOverlayStore.getState().setAutoGenerate(!autoGenerate)}
        title={autoGenerate ? "Auto-generate ON — click to disable" : "Auto-generate OFF — click to enable"}
        className={cn(
          "flex items-center gap-1 px-1.5 py-1 h-8 rounded-lg transition-all shrink-0 text-[11px] font-semibold border",
          autoGenerate
            ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25"
            : "text-gray-500 bg-transparent border-white/5 hover:text-gray-300 hover:bg-white/5"
        )}
      >
        <RefreshCw className="w-2.5 h-2.5" />
        <span>Auto</span>
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          autoGenerate ? "bg-emerald-400" : "bg-gray-600"
        )} />
      </button>

      {/* Simple language indicator — click to toggle off */}
      {simpleLanguage && (
        <button
          onClick={() => useOverlayStore.getState().setSimpleLanguage(false)}
          title="Simple language ON — click to disable"
          className="flex items-center gap-1 px-1.5 py-0.5 h-8 rounded-lg text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all shrink-0"
        >
          <span>Simple</span>
        </button>
      )}

      <button
        onClick={() => useOverlayStore.getState().cycleHintStyle()}
        title={`Hint style: ${hintStyle.replace("_", " ")}`}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-all text-brand-300/70 hover:text-brand-300 hover:bg-white/8 shrink-0 h-8"
      >
        <Type className="w-3 h-3" />
        {HINT_STYLE_LABELS[hintStyle] || "Full"}
      </button>

      <div className="relative" ref={modelMenuRef}>
        <button
          onClick={() => setShowModelMenu((p) => !p)}
          title="Switch AI model"
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/8 h-8 shrink-0"
        >
          {MODEL_OPTIONS.find((m) => m.id === activeModel)?.label ?? "Model"}
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
        {showModelMenu && (
          <div className="absolute top-full left-0 mt-1 w-44 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  useOverlayStore.getState().setActiveModel(m.id);
                  setShowModelMenu(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[11px] transition-all",
                  activeModel === m.id
                    ? "text-brand-300 bg-brand-500/10 font-semibold"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                <span>{m.label}</span>
                {m.note && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/40">({m.note})</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <ToolbarButton
        icon={isMinimal ? Zap : Minimize2}
        label={isMinimal ? "Exit minimal" : "Minimal mode"}
        active={isMinimal}
        color={isMinimal ? "amber" : "gray"}
        onClick={() => useOverlayStore.getState().setMinimalMode(!isMinimal)}
      />

      <ToolbarButton
        icon={AlertCircle}
        label="Panic"
        active={false}
        color="red"
        onClick={() => {
          useOverlayStore.getState().showPanic(PANIC_RESPONSE);
        }}
      />

      <div className="relative" ref={pinnedMenuRef}>
        <button
          onClick={() => setShowPinnedMenu((p) => !p)}
          title={pinnedHints.length > 0 ? `${pinnedHints.length} pinned hint${pinnedHints.length > 1 ? "s" : ""}` : "No pinned hints yet"}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-lg transition-all relative",
            pinnedHints.length > 0
              ? "text-brand-300/60 hover:text-brand-300 hover:bg-white/8"
              : "text-gray-700 opacity-40"
          )}
        >
          <Star className={cn("w-3.5 h-3.5", pinnedHints.length > 0 && "fill-brand-300/40")} />
          {pinnedHints.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand-500 text-[11px] font-bold text-white flex items-center justify-center leading-none">
              {pinnedHints.length > 9 ? "9+" : pinnedHints.length}
            </span>
          )}
        </button>
        {showPinnedMenu && (
          <div className="absolute top-full right-0 mt-1 w-64 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Pinned Hints</p>
              {pinnedHints.length > 0 && (
                <button
                  onClick={() => useOverlayStore.getState().clearPinnedHints()}
                  className="text-[11px] text-muted-foreground/40 hover:text-red-400 transition-colors"
                >
                  clear all
                </button>
              )}
            </div>
            {pinnedHints.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-muted-foreground/40 italic text-center">
                Pin hints using the Pin button in the answer panel
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto py-1">
                {pinnedHints.slice(-6).reverse().map((pin) => (
                  <div key={pin.id} className="group relative px-3 py-2 hover:bg-white/5 transition-colors">
                    <p className="text-[11px] text-muted-foreground/40 truncate mb-0.5">{pin.question || "No question"}</p>
                    <p className="text-[11px] text-overlay-text/80 line-clamp-2">{pin.hint}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={() => {
                          useOverlayStore.getState().setHintState("ready");
                          useOverlayStore.setState({ current_hint: pin.hint, current_question: pin.question });
                          useOverlayStore.getState().setActiveTab("answer");
                          setShowPinnedMenu(false);
                        }}
                        className="text-[11px] text-brand-300/60 hover:text-brand-300 transition-colors"
                      >
                        Jump to →
                      </button>
                      <button
                        onClick={() => useOverlayStore.getState().togglePinHint(pin.hint, pin.question)}
                        className="text-[11px] text-muted-foreground/30 hover:text-red-400 transition-colors"
                      >
                        <Pin className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative" ref={hotkeyRefRef}>
        <button
          onClick={() => setShowHotkeyRef((p) => !p)}
          title="Keyboard shortcuts"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/8 transition-all"
        >
          <span className="text-[11px] font-mono font-semibold">?</span>
        </button>
        {showHotkeyRef && (
          <div className="absolute top-full right-0 mt-1 w-52 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Shortcuts</p>
            <div className="space-y-1.5">
              {HOTKEY_REFERENCE.map((hk) => (
                <div key={hk.label} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground/70">{hk.label}</span>
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] text-muted-foreground font-mono">
                    {formatHotkeyLabel(hk.keys)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      <button
        onClick={onEndSession}
        className="flex items-center gap-1.5 px-2.5 py-1.5 h-8 bg-red-600/20 hover:bg-red-600/30 border border-red-500/25 text-red-400 text-[11px] font-semibold rounded-lg transition-all shrink-0"
      >
        <Square className="w-3 h-3" />
        End
      </button>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  color,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  color: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    green:   "text-green-400 bg-green-500/10",
    red:     "text-red-400 bg-red-500/10",
    amber:   "text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    violet:  "text-violet-400 bg-violet-500/10",
    blue:    "text-blue-400 bg-blue-500/10",
    gray:    "text-gray-400 bg-white/5",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-lg transition-all shrink-0",
        active
          ? cn(colorClasses[color])
          : "text-gray-500 hover:text-gray-300 hover:bg-white/8",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
