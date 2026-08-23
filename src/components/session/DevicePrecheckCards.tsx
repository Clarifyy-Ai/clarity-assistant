import { Mic, MicOff, RefreshCw, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { AudioDevice } from "@/types/audio.types";
import {
  AI_STATUS_COPY,
  AiState,
  MIC_PERMISSION_RECOVERY,
  MIC_READY_STT_UNAVAILABLE,
  MIC_STATUS_COPY,
  MicState,
  SPEAKER_STATUS_COPY,
  STT_STATUS_COPY,
  SpeakerState,
  SttState,
} from "@/lib/audio/precheckStates";

function statusTone(ok: boolean, warn: boolean, bad: boolean): string {
  if (ok) return "border-emerald-500/30 bg-emerald-500/10";
  if (warn) return "border-amber-500/30 bg-amber-500/10";
  if (bad) return "border-red-500/30 bg-red-500/10";
  return "border-border bg-secondary/20";
}

export function DevicePrecheckCards({
  voiceRequired,
  micState,
  speakerState,
  sttState,
  aiState = AiState.AI_NOT_CHECKED,
  micDevices,
  speakerDevices,
  selectedMicId,
  selectedSpeakerId,
  deviceLabel,
  peakRms,
  usedFallback,
  micError,
  sttMessage,
  outputSelectable,
  speakerPlaying,
  onRecheckMic,
  onChangeMic,
  onPlaySpeaker,
  onChangeSpeaker,
  onRecheckStt,
}: {
  voiceRequired: boolean;
  micState: MicState;
  speakerState: SpeakerState;
  sttState: SttState;
  aiState?: AiState;
  micDevices: AudioDevice[];
  speakerDevices: AudioDevice[];
  selectedMicId: string | null;
  selectedSpeakerId: string | null;
  deviceLabel: string | null;
  peakRms: number;
  usedFallback: boolean;
  micError: string | null;
  sttMessage: string | null;
  outputSelectable: boolean;
  speakerPlaying: boolean;
  onRecheckMic: () => void;
  onChangeMic: (deviceId: string) => void;
  onPlaySpeaker: () => void;
  onChangeSpeaker: (deviceId: string) => void;
  onRecheckStt: () => void;
}) {
  if (!voiceRequired) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Text-only mode is selected. Microphone, speaker, and transcription checks are not required.
      </p>
    );
  }

  const micReady = micState === MicState.READY;
  const micChecking = micState === MicState.CHECKING;
  const micDenied = micState === MicState.PERMISSION_DENIED;
  const micWarn = micState === MicState.NO_SIGNAL || usedFallback;
  const micBad =
    micDenied ||
    micState === MicState.DEVICE_UNAVAILABLE ||
    micState === MicState.BROWSER_UNSUPPORTED ||
    micState === MicState.ERROR;
  const speakerReady = speakerState === SpeakerState.READY;
  const speakerBlocked = speakerState === SpeakerState.PLAYBACK_BLOCKED;
  const speakerBad = speakerState === SpeakerState.ERROR || speakerState === SpeakerState.DEVICE_UNAVAILABLE;
  const sttReady = sttState === SttState.STT_READY;
  const sttDown = sttState === SttState.STT_UNAVAILABLE || sttState === SttState.STT_ERROR;
  const aiReady = aiState === AiState.AI_READY;
  const aiDown = aiState === AiState.AI_UNAVAILABLE;

  const speakerActionLabel =
    speakerPlaying ? "Playing test…" : speakerReady ? "Play again" : "Play test";

  const levelPct = Math.min(100, Math.round(peakRms * 800));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="device-precheck">
      <section
        aria-labelledby="precheck-mic-heading"
        className={cn("rounded-xl border p-4 space-y-3 min-w-0", statusTone(micReady, micWarn, micBad))}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="precheck-mic-heading" className="text-sm font-semibold text-foreground flex items-center gap-2">
              {micDenied || micBad ? <MicOff className="w-4 h-4 shrink-0" aria-hidden /> : <Mic className="w-4 h-4 shrink-0" aria-hidden />}
              Microphone
            </h3>
            <p
              id="precheck-mic-status"
              role="status"
              aria-live="polite"
              className="text-sm mt-1 text-foreground"
            >
              {MIC_STATUS_COPY[micState]}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 shrink-0"
            onClick={onRecheckMic}
            disabled={micChecking}
            aria-describedby="precheck-mic-status"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", micChecking && "animate-spin")} aria-hidden />
            Recheck microphone
          </Button>
        </div>

        <div>
          <label htmlFor="precheck-mic-device" className="block text-xs font-medium text-muted-foreground mb-1.5">
            Selected device
          </label>
          {micDevices.length > 0 ? (
            <select
              id="precheck-mic-device"
              value={selectedMicId ?? ""}
              onChange={(e) => onChangeMic(e.target.value)}
              disabled={micChecking}
              className="w-full min-w-0 bg-background/60 border border-border text-foreground rounded-xl px-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm truncate"
            >
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">
              {deviceLabel ?? "No microphone listed yet. Recheck after allowing access."}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Signal</p>
          <div
            role="progressbar"
            aria-label="Microphone audio level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={levelPct}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${levelPct}%` }}
            />
          </div>
        </div>

        {usedFallback && (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Previous microphone was not found. A different device was selected — Recheck if needed.
          </p>
        )}
        {micDenied && (
          <p id="precheck-mic-error" role="alert" className="text-xs text-red-700 dark:text-red-300">
            {MIC_PERMISSION_RECOVERY}
          </p>
        )}
        {micState === MicState.NO_SIGNAL && (
          <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
            Permission is granted, but no audio signal was detected. Speak near the microphone or change device.
          </p>
        )}
        {micError && micState === MicState.ERROR && (
          <p id="precheck-mic-error" role="alert" className="text-xs text-red-700 dark:text-red-300">
            {micError}
          </p>
        )}
      </section>

      <section
        aria-labelledby="precheck-speaker-heading"
        className={cn(
          "rounded-xl border p-4 space-y-3 min-w-0",
          statusTone(speakerReady, speakerBlocked, speakerBad),
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="precheck-speaker-heading" className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Volume2 className="w-4 h-4 shrink-0" aria-hidden />
              Speaker
            </h3>
            <p id="precheck-speaker-status" role="status" aria-live="polite" className="text-sm mt-1 text-foreground">
              {SPEAKER_STATUS_COPY[speakerState]}
            </p>
          </div>
        </div>

        {outputSelectable && speakerDevices.length > 0 ? (
          <div>
            <label htmlFor="precheck-speaker-device" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Output device
            </label>
            <select
              id="precheck-speaker-device"
              value={selectedSpeakerId ?? ""}
              onChange={(e) => onChangeSpeaker(e.target.value)}
              disabled={speakerPlaying}
              className="w-full min-w-0 bg-background/60 border border-border text-foreground rounded-xl px-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm truncate"
            >
              {speakerDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Using the system default output. This browser does not expose exact speaker device detection.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant={speakerReady ? "success" : "secondary"}
            className="flex-1 min-h-11"
            onClick={onPlaySpeaker}
            disabled={speakerPlaying}
            aria-describedby="precheck-speaker-status"
          >
            {speakerActionLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 shrink-0"
            onClick={onPlaySpeaker}
            disabled={speakerPlaying}
          >
            Recheck speakers
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="precheck-stt-heading"
        className={cn(
          "rounded-xl border p-4 space-y-2 min-w-0",
          statusTone(sttReady, sttDown, false),
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="precheck-stt-heading" className="text-sm font-semibold text-foreground">
              Transcription service
            </h3>
            <p id="precheck-stt-status" role="status" aria-live="polite" className="text-sm mt-1 text-foreground">
              {sttMessage ?? STT_STATUS_COPY[sttState]}
            </p>
            {micReady && sttDown && (
              <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">{MIC_READY_STT_UNAVAILABLE}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 shrink-0"
            onClick={onRecheckStt}
            disabled={sttState === SttState.STT_CHECKING}
          >
            Recheck transcription
          </Button>
        </div>
        {sttDown && (
          <p className="text-xs text-muted-foreground">
            This does not mean your microphone is broken. You can still start after the local microphone and speaker checks pass.
          </p>
        )}
      </section>

      <section
        aria-labelledby="precheck-ai-heading"
        className={cn(
          "rounded-xl border p-4 space-y-2 min-w-0",
          statusTone(aiReady, aiDown, false),
        )}
      >
        <h3 id="precheck-ai-heading" className="text-sm font-semibold text-foreground">
          Coaching service
        </h3>
        <p id="precheck-ai-status" role="status" aria-live="polite" className="text-sm text-foreground">
          {AI_STATUS_COPY[aiState]}
        </p>
        {aiDown && (
          <p className="text-xs text-muted-foreground">
            Independent of microphone and transcription. Text coaching also requires this service.
          </p>
        )}
      </section>
    </div>
  );
}
