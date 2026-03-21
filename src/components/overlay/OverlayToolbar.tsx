import { useOverlayStore } from "@/store/overlayStore";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { PANIC_RESPONSE } from "@/types/session.types";
import {
  Mic, MicOff, Volume2, VolumeX, Zap, RefreshCw,
  Eye, EyeOff, Square, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlayToolbarProps {
  onToggleMic?: () => void;
  onGenerate?: () => void;
  onEndSession?: () => void;
}

export function OverlayToolbar({ onToggleMic, onGenerate, onEndSession }: OverlayToolbarProps) {
  const isMuted        = useAudioStore((s) => s.is_muted);
  const isCapturing    = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isStealth      = useOverlayStore((s) => s.is_stealth_mode);
  const autoGenerate   = useOverlayStore((s) => s.auto_generate);
  const hintState      = useOverlayStore((s) => s.hint_state);

  const isGenerating = hintState === "generating" || hintState === "streaming";

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5">
      <ToolbarButton
        icon={isMuted ? MicOff : Mic}
        label={isMuted ? "Unmute mic" : "Mute mic"}
        active={isCapturing && !isMuted}
        color={isMuted ? "red" : "green"}
        onClick={onToggleMic}
      />

      <ToolbarButton
        icon={isStealth ? EyeOff : Eye}
        label={isStealth ? "Exit stealth" : "Enter stealth"}
        active={isStealth}
        color={isStealth ? "violet" : "gray"}
        onClick={() => useOverlayStore.getState().setStealthMode(!isStealth)}
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

      <ToolbarButton
        icon={AlertCircle}
        label="Panic"
        active={false}
        color="red"
        onClick={() => {
          useOverlayStore.getState().showPanic(PANIC_RESPONSE);
        }}
      />

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
  icon: any;
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
