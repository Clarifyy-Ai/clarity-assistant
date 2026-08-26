// ✅ FIX P1-B: Stable bottom audio status bar (mic / tab / Deepgram).

import { memo } from "react";
import { Mic, MicOff, Volume2, Wifi, WifiOff } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";
import {
  TRANSCRIPTION_STATUS_COPY,
  TranscriptionState,
  deepgramStatusToTranscription,
} from "@/lib/audio/transcriptionStates";
import { cn } from "@/lib/utils";

export const OverlayAudioStatusBar = memo(function OverlayAudioStatusBar() {
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystem = useAudioStore((s) => !!s.streams?.system_stream);
  const isMuted = useAudioStore((s) => s.is_muted ?? false);
  const currentLevel = useAudioStore((s) => s.levels?.current_level ?? 0);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status ?? "disconnected");
  const pipelineStatus = useAudioStore((s) => s.pipeline_status ?? "idle");
  const streamError = useAudioStore((s) => s.streams?.error ?? null);

  if (!isCapturing && deepgramStatus === "disconnected") return null;

  const dgOk = deepgramStatus === "connected";

  const transcriptionState = deepgramStatusToTranscription(deepgramStatus, pipelineStatus);
  const transcriptionLabel = TRANSCRIPTION_STATUS_COPY[transcriptionState];

  return (
    <div
      className="flex items-center gap-2 border-t border-white/[0.06] bg-[#080812]/90 px-3 py-1.5 shrink-0"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold border",
          isMuted
            ? "text-red-300/90 bg-red-500/10 border-red-500/25"
            : "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25",
        )}
        title={isMuted ? "Microphone muted" : "Microphone active"}
      >
        {isMuted ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
        {isMuted ? "Muted" : "Mic"}
      </span>

      {!isMuted && isCapturing && (
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] border border-white/10 bg-white/[0.04]"
          title="Microphone input level"
          aria-label={`Mic level ${Math.round(currentLevel * 100)} percent`}
        >
          <span className="flex items-end gap-0.5 h-3">
            {[0.25, 0.5, 0.75, 1].map((threshold) => (
              <span
                key={threshold}
                className={cn(
                  "w-0.5 rounded-sm transition-all",
                  currentLevel >= threshold ? "bg-emerald-400" : "bg-white/15",
                )}
                style={{ height: `${threshold * 12}px` }}
              />
            ))}
          </span>
        </span>
      )}

      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold border",
          hasSystem
            ? "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25"
            : "text-amber-300/80 bg-amber-500/10 border-amber-500/20",
        )}
        title={
          hasSystem
            ? "Interviewer tab audio captured"
            : "Mic only — share tab audio to capture interviewer"
        }
      >
        <Volume2 className="w-2.5 h-2.5" />
        {hasSystem ? "Tab audio" : "Mic only"}
      </span>

      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold border ml-auto",
          transcriptionState === TranscriptionState.READY ||
            transcriptionState === TranscriptionState.TRANSCRIBING ||
            transcriptionState === TranscriptionState.RECEIVING_AUDIO
            ? "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25"
            : transcriptionState === TranscriptionState.CONNECTING ||
                transcriptionState === TranscriptionState.RECONNECTING
              ? "text-amber-300/80 bg-amber-500/10 border-amber-500/20"
              : transcriptionState === TranscriptionState.TEXT_ONLY ||
                  transcriptionState === TranscriptionState.ENDED
                ? "text-sky-300/80 bg-sky-500/10 border-sky-500/20"
                : "text-amber-300/80 bg-amber-500/10 border-amber-500/20",
        )}
        title={`Transcription: ${transcriptionLabel}`}
        data-transcription-state={transcriptionState}
      >
        {dgOk ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
        {transcriptionLabel}
      </span>

      {streamError?.message && (
        <span className="text-[10px] text-red-400/80 truncate max-w-[120px]" title={streamError.message}>
          ⚠
        </span>
      )}
    </div>
  );
});
