// src/components/overlay/OverlaySystemAudioBanner.tsx
//
// Sticky warning shown when the live session was started with
// `enable_system_audio: true` but no tab-audio MediaStream is currently
// captured (user dismissed the share picker, unchecked "Share audio",
// or the track ended).
//
// Guardrail: purely presentational. It does NOT modify any working
// audio-session logic — it only re-invokes `onRetry`, which the parent
// already wires to `useAudioSession.toggleSystemAudio`.

import { useState } from "react";
import { AlertTriangle, Volume2, X } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";

interface Props {
  /** True if the active session opted into system audio. */
  enabled: boolean;
  /** Re-prompts the Chrome tab-share picker. */
  onRetry?: () => void;
}

export function OverlaySystemAudioBanner({ enabled, onRetry }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystem   = useAudioStore((s) => !!s.streams?.system_stream);

  if (!enabled || !isCapturing || hasSystem || dismissed) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200"
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold leading-tight">
          Interviewer audio unavailable
        </p>
        <p className="text-[10px] text-amber-200/70 leading-snug mt-0.5">
          Mic-only — the coach cannot auto-detect interviewer questions. Share
          the interview tab and tick{" "}
          <span className="font-semibold">“Share tab audio”</span> in Chrome, or
          type the question in Chat.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors"
          >
            <Volume2 className="w-3 h-3" />
            Share audio
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
