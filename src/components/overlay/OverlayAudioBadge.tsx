// src/components/overlay/OverlayAudioBadge.tsx
import { useAudioStore } from "@/store/audioStore";
import { Mic, Volume2 } from "lucide-react";

export function OverlayAudioBadge() {
  const isCapturing  = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystem    = useAudioStore((s) => !!s.streams?.system_stream);

  if (!isCapturing) return null;

  if (hasSystem) {
    return (
      <span
        className="flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md"
        title="Dual audio capture active (mic + system)"
      >
        <Volume2 className="w-2.5 h-2.5" />
        DUAL
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1 font-mono text-[10px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md"
      title="Mic-only capture — interviewer audio not captured"
    >
      <Mic className="w-2.5 h-2.5" />
      MIC
    </span>
  );
}
