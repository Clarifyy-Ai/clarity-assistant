/**
 * Consolidated Practice Coach status — one underlying problem → one visible warning.
 */

import type { DeepgramTokenState, RuntimeMicState } from "@/types/audio.types";
import type { AudioPipelineStatus, TranscriptionProviderStatus } from "@/types/audio.types";
import {
  MIC_PERMISSION_RECOVERY,
  MIC_READY_STT_UNAVAILABLE,
  STT_STATUS_COPY,
} from "@/lib/audio/precheckStates";
import { providerStatusToTranscription } from "@/lib/audio/transcriptionStates";

export type PracticeCoachWarningSeverity = "info" | "warn" | "error";

export type PracticeCoachWarning = {
  id: string;
  severity: PracticeCoachWarningSeverity;
  title: string;
  message: string;
  recoverable: boolean;
};

export type PracticeCoachStatusInput = {
  micState: RuntimeMicState;
  tokenState: DeepgramTokenState;
  transcriptionProviderStatus: TranscriptionProviderStatus;
  pipelineStatus: AudioPipelineStatus;
  streamErrorMessage?: string | null;
  streamErrorCode?: string | null;
  sessionRestored?: boolean;
  needsMicReconnect?: boolean;
};

function micRuntimeToCopy(state: RuntimeMicState): string | null {
  switch (state) {
    case "ready":
      return "Microphone ready";
    case "requesting_permission":
      return "Requesting microphone access…";
    case "permission_denied":
      return "Permission denied";
    case "device_unavailable":
      return "Microphone unavailable";
    case "no_signal":
      return "No microphone signal detected";
    case "error":
      return "Microphone check failed";
    default:
      return null;
  }
}

function sttUnavailableCopy(
  tokenState: DeepgramTokenState,
  providerStatus: TranscriptionProviderStatus,
  pipelineStatus: AudioPipelineStatus,
): boolean {
  if (tokenState === "failed") return true;
  if (providerStatus === "error" || providerStatus === "unavailable") return true;
  if (pipelineStatus === "unavailable") return true;
  const tx = providerStatusToTranscription(providerStatus, pipelineStatus);
  return tx === "unavailable" || tx === "text_only";
}

export function buildPracticeCoachWarnings(
  input: PracticeCoachStatusInput,
): PracticeCoachWarning[] {
  const warnings: PracticeCoachWarning[] = [];

  if (input.sessionRestored && input.needsMicReconnect) {
    warnings.push({
      id: "session-restored-reconnect-mic",
      severity: "info",
      title: "Session restored",
      message: "Microphone permission is required to continue transcription.",
      recoverable: true,
    });
  }

  if (input.micState === "permission_denied") {
    warnings.push({
      id: "mic-denied",
      severity: "error",
      title: "Microphone permission required",
      message: MIC_PERMISSION_RECOVERY,
      recoverable: true,
    });
  } else if (
    input.micState === "device_unavailable" ||
    input.micState === "error"
  ) {
    warnings.push({
      id: "mic-unavailable",
      severity: "error",
      title: micRuntimeToCopy(input.micState) ?? "Microphone unavailable",
      message:
        input.streamErrorMessage ??
        "Check your microphone device and browser settings, then reconnect.",
      recoverable: true,
    });
  }

  const micReady =
    input.micState === "ready" || input.micState === "no_signal";
  const sttDown = sttUnavailableCopy(
    input.tokenState,
    input.transcriptionProviderStatus,
    input.pipelineStatus,
  );

  if (micReady && sttDown) {
    warnings.push({
      id: "stt-unavailable",
      severity: "warn",
      title: "Transcription unavailable",
      message:
        input.tokenState === "failed"
          ? "Speech recognition could not start. You can still type questions in Chat."
          : MIC_READY_STT_UNAVAILABLE,
      recoverable: true,
    });
  } else if (!micReady && sttDown && input.micState !== "permission_denied") {
    // Only show STT if mic isn't the primary blocker (avoid stacked duplicates).
    if (input.tokenState === "failed") {
      warnings.push({
        id: "stt-token-failed",
        severity: "warn",
        title: STT_STATUS_COPY.STT_UNAVAILABLE,
        message: "Transcription service timed out or is unavailable.",
        recoverable: true,
      });
    }
  }

  // Deduplicate by id (last wins)
  const byId = new Map<string, PracticeCoachWarning>();
  for (const w of warnings) {
    byId.set(w.id, w);
  }
  return Array.from(byId.values());
}

export function primaryPracticeCoachWarning(
  warnings: PracticeCoachWarning[],
): PracticeCoachWarning | null {
  if (!warnings.length) return null;
  const rank: Record<PracticeCoachWarningSeverity, number> = {
    error: 3,
    warn: 2,
    info: 1,
  };
  return [...warnings].sort((a, b) => rank[b.severity] - rank[a.severity])[0];
}

export function formatPracticeCoachStatusLine(input: PracticeCoachStatusInput): string {
  const mic = micRuntimeToCopy(input.micState);
  const stt = sttUnavailableCopy(
    input.tokenState,
    input.transcriptionProviderStatus,
    input.pipelineStatus,
  )
    ? STT_STATUS_COPY.STT_UNAVAILABLE
    : STT_STATUS_COPY.STT_READY;
  const parts = [mic, stt].filter(Boolean);
  return parts.join(" · ");
}
