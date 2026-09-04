// src/components/overlay/OverlaySpeakerSeparationBanner.tsx
//
// Dedicated warning when dual-channel STT is connected but speaker
// attribution (THEM vs YOU) looks weak — separate from low-STT chat attention.

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";
import { isUncertainSpeakerSeparation } from "@/lib/audio/speakerSeparation";

export function OverlaySpeakerSeparationBanner() {
  const [dismissed, setDismissed] = useState(false);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystem = useAudioStore((s) =>
    ["active", "connecting", "silent_source"].includes(
      s.channel_health?.interviewer?.status ?? "disconnected",
    ),
  );
  const pipelineStatus = useAudioStore((s) => s.pipeline_status);
  const utterances = useAudioStore((s) => s.transcript?.utterances ?? []);
  const minConfidence = useAudioStore((s) => s.question_confidence_min);

  const uncertain = isUncertainSpeakerSeparation({
    isCapturing,
    hasInterviewerChannel: hasSystem,
    pipelineStatus,
    utterances,
    minConfidence,
  });

  if (!uncertain || dismissed) return null;

  return (
    <div
      role="alert"
      data-coach="speaker-separation-banner"
      className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200"
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold leading-tight">
          Speaker separation uncertain
        </p>
        <p className="text-[10px] text-amber-200/70 leading-snug mt-0.5">
          Dual-channel audio is connected, but THEM/YOU labels may be wrong.
          Prefer Chat to type the question if auto-detect looks off.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss speaker separation warning"
        onClick={() => setDismissed(true)}
        className="p-1 rounded-md hover:bg-amber-500/20 text-amber-200/80 shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
