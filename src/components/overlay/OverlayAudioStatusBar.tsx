// Stable bottom audio status bar (mic / tab / live transcription).

import { memo } from "react";
import { Mic, MicOff, Volume2, Wifi, WifiOff } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import {
  LIVE_TRANSCRIPTION_BAR_COPY,
  MIC_STATUS_COPY,
} from "@/lib/audio/transcriptionStates";
import { cn } from "@/lib/utils";

function isLiveSessionStatus(status: string | undefined): boolean {
  return (
    status === "pending" ||
    status === "warming_up" ||
    status === "starting" ||
    status === "active" ||
    status === "paused"
  );
}

function micBarCopy(input: {
  sessionPaused: boolean;
  permissionDenied: boolean;
  isCapturing: boolean;
  isMuted: boolean;
}): { key: keyof typeof MIC_STATUS_COPY; label: string } {
  if (input.permissionDenied) {
    return { key: "permission_denied", label: MIC_STATUS_COPY.permission_denied };
  }
  if (input.sessionPaused) {
    return { key: "paused", label: MIC_STATUS_COPY.paused };
  }
  if (!input.isCapturing) {
    return { key: "disconnected", label: MIC_STATUS_COPY.disconnected };
  }
  if (input.isMuted) {
    return { key: "paused", label: MIC_STATUS_COPY.paused };
  }
  return { key: "active", label: MIC_STATUS_COPY.active };
}

function transcriptionBarCopy(providerStatus: string): {
  key: keyof typeof LIVE_TRANSCRIPTION_BAR_COPY;
  label: string;
} {
  if (providerStatus === "connecting" || providerStatus === "reconnecting") {
    return { key: "connecting", label: LIVE_TRANSCRIPTION_BAR_COPY.connecting };
  }
  if (providerStatus === "connected") {
    return { key: "connected", label: LIVE_TRANSCRIPTION_BAR_COPY.connected };
  }
  return { key: "unavailable", label: LIVE_TRANSCRIPTION_BAR_COPY.unavailable };
}

export const OverlayAudioStatusBar = memo(function OverlayAudioStatusBar() {
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystem = useAudioStore((s) => !!s.streams?.system_stream);
  const isMuted = useAudioStore((s) => s.is_muted ?? false);
  const currentLevel = useAudioStore((s) => s.levels?.current_level ?? 0);
  const providerStatus = useAudioStore((s) => s.transcription_provider_status ?? "idle");
  const streamError = useAudioStore((s) => s.streams?.error ?? null);
  const micState = useAudioStore((s) => s.mic_state);
  const sessionStatus = useSessionStore((s) => s.status);

  if (!isLiveSessionStatus(sessionStatus)) return null;

  const sessionPaused = sessionStatus === "paused" || providerStatus === "paused";
  const permissionDenied = micState === "permission_denied";
  const mic = micBarCopy({
    sessionPaused,
    permissionDenied,
    isCapturing,
    isMuted,
  });
  const transcription = transcriptionBarCopy(providerStatus);
  const providerOk = transcription.key === "connected";
  const micActive = mic.key === "active";

  return (
    <div
      className="flex items-center gap-2 border-t border-white/[0.06] bg-[#080812]/90 px-3 py-1.5 shrink-0"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold border",
          mic.key === "permission_denied" || mic.key === "disconnected"
            ? "text-red-300/90 bg-red-500/10 border-red-500/25"
            : mic.key === "paused"
              ? "text-sky-300/80 bg-sky-500/10 border-sky-500/20"
              : "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25",
        )}
        title={mic.label}
        data-mic-state={mic.key}
      >
        {micActive ? <Mic className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5" />}
        {mic.label}
      </span>

      {micActive && (
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
          transcription.key === "connected"
            ? "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25"
            : transcription.key === "connecting"
              ? "text-amber-300/80 bg-amber-500/10 border-amber-500/20"
              : "text-amber-300/80 bg-amber-500/10 border-amber-500/20",
        )}
        title={transcription.label}
        data-transcription-state={transcription.key}
      >
        {providerOk ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
        {transcription.label}
      </span>

      {streamError?.message && (
        <span className="text-[10px] text-red-400/80 truncate max-w-[120px]" title={streamError.message}>
          ⚠
        </span>
      )}
    </div>
  );
});
