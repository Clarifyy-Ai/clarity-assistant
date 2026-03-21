import { useState, useRef, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useUIStore } from "@/store/uiStore";
import { useAudioStore } from "@/store/audioStore";
import { PANIC_RESPONSE } from "@/types/session.types";
import {
  Mic, MicOff, Volume2, VolumeX, Zap, RefreshCw,
  Eye, EyeOff, Square, AlertCircle, Type, ChevronDown, Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import type { LucideIcon } from "lucide-react";
import type { PreferredAIModel } from "@/types/user.types";

const MODEL_OPTIONS: { id: PreferredAIModel; label: string }[] = [
  { id: "gpt-4o",            label: "GPT-4o" },
  { id: "claude-3-5-sonnet", label: "Claude" },
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
  { keys: ["escape"],             label: "Clear hint" },
];

interface OverlayToolbarProps {
  onToggleMic?: () => void;
  onToggleSystemAudio?: () => void;
  onGenerate?: () => void;
  onEndSession?: () => void;
}

export function OverlayToolbar({ onToggleMic, onToggleSystemAudio, onGenerate, onEndSession }: OverlayToolbarProps) {
  const isMuted        = useAudioStore((s) => s.is_muted);
  const isCapturing    = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystemAudio = useAudioStore((s) => !!s.streams?.system_stream);
  const isStealth      = useOverlayStore((s) => s.is_stealth_mode);
  const autoGenerate   = useOverlayStore((s) => s.auto_generate);
  const hintState      = useOverlayStore((s) => s.hint_state);
  const hintStyle      = useOverlayStore((s) => s.hint_style);
  const activeModel    = useOverlayStore((s) => s.active_model);

  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showHotkeyRef, setShowHotkeyRef] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const hotkeyRefRef = useRef<HTMLDivElement>(null);

  const isGenerating = hintState === "generating" || hintState === "streaming";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setShowModelMenu(false);
      if (hotkeyRefRef.current && !hotkeyRefRef.current.contains(e.target as Node)) setShowHotkeyRef(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5 flex-wrap">
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
        onClick={() => {
          const next = !isStealth;
          useOverlayStore.getState().setStealthMode(next);
          useUIStore.getState().setStealthMode(next);
        }}
      />

      <ToolbarButton
        icon={Zap}
        label="Generate answer"
        active={isGenerating}
        color="amber"
        onClick={onGenerate}
        disabled={isGenerating}
      />

      <ToolbarButton
        icon={RefreshCw}
        label={autoGenerate ? "Auto-gen ON" : "Auto-gen OFF"}
        active={autoGenerate}
        color={autoGenerate ? "emerald" : "gray"}
        onClick={() => useOverlayStore.getState().setAutoGenerate(!autoGenerate)}
        small
      />

      <button
        onClick={() => useOverlayStore.getState().cycleHintStyle()}
        title={`Hint style: ${hintStyle.replace("_", " ")}`}
        className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wide transition-all text-brand-300/70 hover:text-brand-300 hover:bg-white/5"
      >
        <Type className="w-2.5 h-2.5" />
        {HINT_STYLE_LABELS[hintStyle] || "Full"}
      </button>

      <div className="relative" ref={modelMenuRef}>
        <button
          onClick={() => setShowModelMenu((p) => !p)}
          title="Switch AI model"
          className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[9px] font-semibold transition-all text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5"
        >
          {MODEL_OPTIONS.find((m) => m.id === activeModel)?.label ?? "Model"}
          <ChevronDown className="w-2 h-2" />
        </button>
        {showModelMenu && (
          <div className="absolute top-full left-0 mt-1 w-32 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  useOverlayStore.getState().setActiveModel(m.id);
                  setShowModelMenu(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[10px] transition-all",
                  activeModel === m.id
                    ? "text-brand-300 bg-brand-500/10 font-semibold"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ToolbarButton
        icon={AlertCircle}
        label="Panic"
        active={false}
        color="red"
        onClick={() => {
          useOverlayStore.getState().showPanic(PANIC_RESPONSE);
        }}
      />

      <div className="relative" ref={hotkeyRefRef}>
        <button
          onClick={() => setShowHotkeyRef((p) => !p)}
          title="Keyboard shortcuts"
          className="p-1 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-all"
        >
          <Keyboard className="w-3 h-3" />
        </button>
        {showHotkeyRef && (
          <div className="absolute top-full right-0 mt-1 w-52 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Shortcuts</p>
            <div className="space-y-1.5">
              {HOTKEY_REFERENCE.map((hk) => (
                <div key={hk.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/70">{hk.label}</span>
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-muted-foreground font-mono">
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
        className="flex items-center gap-1 px-2 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 text-[10px] font-medium rounded-lg transition-all"
      >
        <Square className="w-2.5 h-2.5" />
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
  small,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  color: string;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    green:   "text-green-400",
    red:     "text-red-400",
    amber:   "text-amber-400",
    emerald: "text-emerald-400",
    violet:  "text-violet-400",
    gray:    "text-gray-500",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "p-1.5 rounded-lg transition-all",
        active
          ? cn(colorClasses[color], "bg-white/5")
          : "text-gray-500 hover:text-gray-300 hover:bg-white/5",
        disabled && "opacity-40 cursor-not-allowed",
        small && "p-1",
      )}
    >
      <Icon className={cn(small ? "w-2.5 h-2.5" : "w-3.5 h-3.5")} />
    </button>
  );
}
