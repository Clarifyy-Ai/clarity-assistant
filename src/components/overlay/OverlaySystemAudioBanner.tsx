// src/components/overlay/OverlaySystemAudioBanner.tsx
//
// Sticky warning when system audio was expected but interviewer channel is not healthy.

import { useState } from "react";
import { AlertTriangle, Volume2, X } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";
import { isChannelUiActive } from "@/lib/audio/audioChannelHealth";
import {
  deriveShareAudioState,
  shouldShowShareAudioPrompt,
  shareAudioStateLabel,
} from "@/lib/audio/shareAudioState";

interface Props {
  /** True if the active session opted into system audio. */
  enabled: boolean;
  /** Re-prompts the Chrome tab-share picker. */
  onRetry?: () => void;
}

export function OverlaySystemAudioBanner({ enabled, onRetry }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const interviewerStatus = useAudioStore(
    (s) => s.channel_health?.interviewer?.status ?? "disconnected",
  );
  const micStatus = useAudioStore((s) => s.channel_health?.mic?.status ?? "disconnected");
  const tabActive = isChannelUiActive(interviewerStatus);
  const micActive = isChannelUiActive(micStatus);
  const silent = interviewerStatus === "silent_source";
  const shareState = deriveShareAudioState({
    requested: false,
    hasStream: Boolean(useAudioStore.getState().streams?.system_stream),
    channelActive: tabActive,
    channelConnecting: interviewerStatus === "connecting",
    channelSilent: silent,
    denied: false,
    unsupported: false,
    failed: interviewerStatus === "unavailable",
    paused: false,
  });

  if (!enabled || !isCapturing || dismissed) return null;
  if (shareState === "ACTIVE" && !silent) return null;
  if (interviewerStatus === "connecting") return null;

  const silentCopy = silent
    ? "Tab audio is connected but no interviewer speech is reaching transcription. Check Share tab audio, meeting mute, or that you shared the correct tab."
    : "Mic-only — the coach cannot auto-detect interviewer questions. Share the interview tab and tick “Share tab audio” in Chrome, or type the question in Chat.";

  const headline = silent
    ? micActive
      ? "Interviewer audio silent — your mic is working"
      : "Interviewer audio silent"
    : micActive
      ? "Interviewer audio unavailable — your mic is working"
      : "Interviewer audio unavailable";

  return (
    <div
      role="alert"
      className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200"
      data-tab-audio-state={interviewerStatus}
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold leading-tight">
          {headline}
        </p>
        <p className="text-[10px] text-amber-200/70 leading-snug mt-0.5">{silentCopy}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onRetry && shouldShowShareAudioPrompt(shareState) && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors"
          >
            <Volume2 className="w-3 h-3" />
            {shareAudioStateLabel(shareState)}
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="p-1 rounded-md hover:bg-amber-500/20 text-amber-200/80"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
