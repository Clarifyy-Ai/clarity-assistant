/**
 * Transcription (remote STT) states — independent of microphone hardware.
 */

export const TranscriptionState = {
  NOT_CHECKED: "not_checked",
  CONNECTING: "connecting",
  READY: "ready",
  RECEIVING_AUDIO: "receiving_audio",
  TRANSCRIBING: "transcribing",
  RECONNECTING: "reconnecting",
  PAUSED: "paused",
  TEXT_ONLY: "text_only",
  UNAVAILABLE: "unavailable",
  ENDED: "ended",
} as const;

export type TranscriptionState =
  (typeof TranscriptionState)[keyof typeof TranscriptionState];

export const TRANSCRIPTION_STATUS_COPY: Record<TranscriptionState, string> = {
  not_checked: "Transcription connecting",
  connecting: "Transcription connecting",
  ready: "Transcription connected",
  receiving_audio: "Transcription connected",
  transcribing: "Transcription connected",
  reconnecting: "Transcription connecting",
  paused: "Transcription unavailable",
  text_only: "Transcription unavailable",
  unavailable: "Transcription unavailable",
  ended: "Transcription unavailable",
};

export const MIC_STATUS_COPY = {
  active: "Mic active",
  connecting: "Mic connecting…",
  paused: "Mic paused",
  disconnected: "Mic disconnected",
  permission_denied: "Mic permission denied",
} as const;

export type MicStatusCopyKey = keyof typeof MIC_STATUS_COPY;

export const LIVE_TRANSCRIPTION_BAR_COPY = {
  connecting: "Transcription connecting",
  connected: "Transcription connected",
  unavailable: "Transcription unavailable",
} as const;

export function providerStatusToTranscription(
  provider: string | undefined,
  pipeline?: string,
): TranscriptionState {
  if (provider === "paused") return TranscriptionState.PAUSED;
  if (provider === "ended") return TranscriptionState.ENDED;
  if (provider === "unavailable") return TranscriptionState.UNAVAILABLE;
  if (provider === "error") return TranscriptionState.UNAVAILABLE;
  if (provider === "connecting") return TranscriptionState.CONNECTING;
  if (provider === "reconnecting") return TranscriptionState.RECONNECTING;
  if (provider === "connected") {
    if (pipeline === "transcribing") return TranscriptionState.TRANSCRIBING;
    if (pipeline === "receiving_audio") return TranscriptionState.RECEIVING_AUDIO;
    return TranscriptionState.READY;
  }
  if (provider === "idle") {
    if (pipeline === "ended") return TranscriptionState.ENDED;
    if (pipeline === "text_only" || pipeline === "microphone_only") {
      return TranscriptionState.TEXT_ONLY;
    }
    if (pipeline === "unavailable") return TranscriptionState.UNAVAILABLE;
    return TranscriptionState.NOT_CHECKED;
  }
  return deepgramStatusToTranscription(provider, pipeline);
}

export function deepgramStatusToTranscription(
  deepgram: string | undefined,
  pipeline?: string,
): TranscriptionState {
  if (pipeline === "ended") return TranscriptionState.ENDED;
  if (pipeline === "text_only") return TranscriptionState.TEXT_ONLY;
  if (pipeline === "transcribing") return TranscriptionState.TRANSCRIBING;
  if (pipeline === "receiving_audio") return TranscriptionState.RECEIVING_AUDIO;
  if (pipeline === "reconnecting") return TranscriptionState.RECONNECTING;
  if (pipeline === "connecting") return TranscriptionState.CONNECTING;
  if (pipeline === "microphone_only") return TranscriptionState.TEXT_ONLY;
  if (pipeline === "unavailable") return TranscriptionState.UNAVAILABLE;

  switch (deepgram) {
    case "connecting":
      return TranscriptionState.CONNECTING;
    case "connected":
      return TranscriptionState.READY;
    case "reconnecting":
      return TranscriptionState.RECONNECTING;
    case "error":
      return TranscriptionState.UNAVAILABLE;
    case "disconnected":
      return pipeline === "listening" || pipeline === "idle"
        ? TranscriptionState.NOT_CHECKED
        : TranscriptionState.UNAVAILABLE;
    default:
      return TranscriptionState.NOT_CHECKED;
  }
}

export function sttHealthToTranscription(sttState: string): TranscriptionState {
  switch (sttState) {
    case "STT_CHECKING":
      return TranscriptionState.CONNECTING;
    case "STT_READY":
    case "STT_RECEIVING_AUDIO":
      return TranscriptionState.READY;
    case "STT_TRANSCRIBING":
      return TranscriptionState.TRANSCRIBING;
    case "STT_RECONNECTING":
      return TranscriptionState.RECONNECTING;
    case "STT_UNAVAILABLE":
    case "STT_ERROR":
      return TranscriptionState.UNAVAILABLE;
    default:
      return TranscriptionState.NOT_CHECKED;
  }
}
