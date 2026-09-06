// Stable bottom audio status bar (mic / tab / live transcription).

import { memo } from "react";
import { Mic, MicOff, Volume2, Wifi, WifiOff } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import {
  LIVE_TRANSCRIPTION_BAR_COPY,
  MIC_STATUS_COPY,
} from "@/lib/audio/transcriptionStates";
import {
  TAB_AUDIO_STATUS_COPY,
  isChannelUiActive,
  liveTranscriptionBarHealth,
  tabAudioTitle,
  worstTranscriptionHealth,
  type AudioChannelHealthStatus,
} from "@/lib/audio/audioChannelHealth";
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
  micHealth: AudioChannelHealthStatus;
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
  // Only claim "Mic active" when channel health confirms real audio flow.
  if (input.micHealth === "active") {
    return { key: "active", label: MIC_STATUS_COPY.active };
  }
  if (input.micHealth === "connecting") {
    return { key: "connecting", label: MIC_STATUS_COPY.connecting };
  }
  if (input.micHealth === "silent_source") {
    return { key: "disconnected", label: MIC_STATUS_COPY.silent };
  }
  return { key: "disconnected", label: MIC_STATUS_COPY.disconnected };
}

function transcriptionBarFromHealth(
  providerStatus: string,
  micHealth: AudioChannelHealthStatus,
  interviewerHealth: AudioChannelHealthStatus,
  systemExpected: boolean,
): { key: keyof typeof LIVE_TRANSCRIPTION_BAR_COPY; label: string; dataState: string } {
  if (providerStatus === "connecting" || providerStatus === "reconnecting") {
    return {
      key: "connecting",
      label: LIVE_TRANSCRIPTION_BAR_COPY.connecting,
      dataState: "connecting",
    };
  }

  const worst = liveTranscriptionBarHealth(micHealth, interviewerHealth, systemExpected);

  if (worst === "connecting") {
    return {
      key: "connecting",
      label: LIVE_TRANSCRIPTION_BAR_COPY.connecting,
      dataState: "connecting",
    };
  }
  if (worst === "silent_source") {
    return {
      key: "unavailable",
      label: "Transcription silent source",
      dataState: "silent_source",
    };
  }
  if (worst === "unavailable" || worst === "disconnected") {
    if (!systemExpected && providerStatus === "connected" && isChannelUiActive(micHealth)) {
      return {
        key: "connected",
        label: LIVE_TRANSCRIPTION_BAR_COPY.connected,
        dataState: "connected",
      };
    }
    if (providerStatus === "connected" && isChannelUiActive(micHealth) && !systemExpected) {
      return {
        key: "connected",
        label: LIVE_TRANSCRIPTION_BAR_COPY.connected,
        dataState: "connected",
      };
    }
    return {
      key: "unavailable",
      label: LIVE_TRANSCRIPTION_BAR_COPY.unavailable,
      dataState: worst,
    };
  }
  if (providerStatus === "connected" && worst === "active") {
    return {
      key: "connected",
      label: LIVE_TRANSCRIPTION_BAR_COPY.connected,
      dataState: "connected",
    };
  }
  if (providerStatus === "connected") {
    // Mic socket open but interviewer not yet active — don't claim full dual health
    if (systemExpected && interviewerHealth !== "active") {
      return {
        key: "connecting",
        label: LIVE_TRANSCRIPTION_BAR_COPY.connecting,
        dataState: interviewerHealth,
      };
    }
    return {
      key: "connected",
      label: LIVE_TRANSCRIPTION_BAR_COPY.connected,
      dataState: "connected",
    };
  }
  return {
    key: "unavailable",
    label: LIVE_TRANSCRIPTION_BAR_COPY.unavailable,
    dataState: "unavailable",
  };
}

function tabBadgeClass(status: AudioChannelHealthStatus): string {
  if (status === "active") {
    return "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25";
  }
  if (status === "connecting" || status === "silent_source") {
    return "text-amber-300/80 bg-amber-500/10 border-amber-500/20";
  }
  if (status === "unavailable") {
    return "text-red-300/80 bg-red-500/10 border-red-500/20";
  }
  return "text-amber-300/80 bg-amber-500/10 border-amber-500/20";
}

export const OverlayAudioStatusBar = memo(function OverlayAudioStatusBar({
  compact = false,
}: {
  compact?: boolean;
}) {
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const interviewerStatus = useAudioStore(
    (s) => s.channel_health?.interviewer?.status ?? "disconnected",
  );
  const micHealthStatus = useAudioStore(
    (s) => s.channel_health?.mic?.status ?? "disconnected",
  );
  const systemAudioExpected = useAudioStore(
    (s) =>
      Boolean(s.setup?.system_audio_available) ||
      Boolean(s.interviewer_channel_active) ||
      Boolean(s.streams?.system_stream) ||
      interviewerStatus !== "disconnected",
  );
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
    micHealth: micHealthStatus,
  });
  const dualExpected =
    systemAudioExpected ||
    interviewerStatus === "connecting" ||
    interviewerStatus === "active" ||
    interviewerStatus === "silent_source";
  const transcription = transcriptionBarFromHealth(
    providerStatus,
    micHealthStatus,
    interviewerStatus,
    dualExpected,
  );
  const providerOk = transcription.key === "connected";
  const micActive = mic.key === "active";

  const micShort =
    mic.key === "active"
      ? "Mic OK"
      : mic.key === "connecting"
        ? "Mic…"
        : mic.key === "paused"
          ? "Mic paused"
          : "Mic off";
  const tabShort =
    interviewerStatus === "active"
      ? "Tab OK"
      : interviewerStatus === "connecting"
        ? "Tab…"
        : interviewerStatus === "silent_source"
          ? "Tab silent"
          : "Tab off";
  const sttShort =
    transcription.key === "connected"
      ? "STT OK"
      : transcription.key === "connecting"
        ? "STT…"
        : "STT off";

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.06] bg-[#080812]/60 px-2 py-1.5"
        role="status"
        aria-live="polite"
      >
        <CompactChip
          ok={mic.key === "active"}
          warn={mic.key === "connecting" || mic.key === "paused"}
          label={micShort}
          title={mic.label}
        />
        <CompactChip
          ok={interviewerStatus === "active"}
          warn={interviewerStatus === "connecting" || interviewerStatus === "silent_source"}
          label={tabShort}
          title={tabAudioTitle(interviewerStatus)}
        />
        <CompactChip
          ok={transcription.key === "connected"}
          warn={transcription.key === "connecting"}
          label={sttShort}
          title={transcription.label}
        />
        {streamError?.message ? (
          <span
            className="text-[10px] text-red-300/90 truncate max-w-[140px] ml-auto"
            title={streamError.message}
          >
            Audio error
          </span>
        ) : null}
      </div>
    );
  }

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
          tabBadgeClass(interviewerStatus),
        )}
        title={tabAudioTitle(interviewerStatus)}
        data-tab-audio-state={interviewerStatus}
      >
        <Volume2 className="w-2.5 h-2.5" />
        {TAB_AUDIO_STATUS_COPY[interviewerStatus]}
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
        data-transcription-state={transcription.dataState}
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

function CompactChip({
  label,
  title,
  ok,
  warn,
}: {
  label: string;
  title: string;
  ok: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold border",
        ok
          ? "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25"
          : warn
            ? "text-amber-300/85 bg-amber-500/10 border-amber-500/20"
            : "text-red-300/85 bg-red-500/10 border-red-500/20",
      )}
      title={title}
    >
      {label}
    </span>
  );
}
