// src/components/overlay/OverlayAudioBadge.tsx
import { useAudioStore } from "@/store/audioStore";
import { Mic, Volume2 } from "lucide-react";
import { isChannelUiActive } from "@/lib/audio/audioChannelHealth";

export function OverlayAudioBadge() {
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const interviewerStatus = useAudioStore(
    (s) => s.channel_health?.interviewer?.status ?? "disconnected",
  );
  const hasActiveTab = isChannelUiActive(interviewerStatus);

  if (!isCapturing) return null;

  if (hasActiveTab) {
    return (
      <span
        className="flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md"
        title="Mic + tab audio flowing"
        data-tab-audio-state={interviewerStatus}
      >
        <Volume2 className="w-2.5 h-2.5" />
        Mic + Tab
      </span>
    );
  }

  if (interviewerStatus === "connecting" || interviewerStatus === "silent_source") {
    return (
      <span
        className="flex items-center gap-1 font-mono text-[10px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md"
        title={
          interviewerStatus === "silent_source"
            ? "Tab share connected but no audible interviewer audio"
            : "Tab audio connecting"
        }
        data-tab-audio-state={interviewerStatus}
      >
        <Volume2 className="w-2.5 h-2.5" />
        {interviewerStatus === "silent_source" ? "Tab silent" : "Tab connecting"}
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1 font-mono text-[10px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md"
      title="Mic only — share the interview tab with audio to capture the interviewer"
      data-tab-audio-state="disconnected"
    >
      <Mic className="w-2.5 h-2.5" />
      Mic only
    </span>
  );
}
