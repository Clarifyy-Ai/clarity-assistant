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
  UNAVAILABLE: "unavailable",
} as const;

export type TranscriptionState =
  (typeof TranscriptionState)[keyof typeof TranscriptionState];

export const TRANSCRIPTION_STATUS_COPY: Record<TranscriptionState, string> = {
  not_checked: "Transcription not checked",
  connecting: "Connecting to transcription…",
  ready: "Transcription ready",
  receiving_audio: "Receiving audio",
  transcribing: "Transcribing",
  reconnecting: "Reconnecting transcription…",
  unavailable: "Transcription unavailable",
};

export function deepgramStatusToTranscription(
  deepgram: string | undefined,
  pipeline?: string,
): TranscriptionState {
  if (pipeline === "transcribing") return TranscriptionState.TRANSCRIBING;
  if (pipeline === "receiving_audio") return TranscriptionState.RECEIVING_AUDIO;
  if (pipeline === "microphone_only" || pipeline === "unavailable") {
    return TranscriptionState.UNAVAILABLE;
  }

  switch (deepgram) {
    case "connecting":
      return TranscriptionState.CONNECTING;
    case "connected":
      return TranscriptionState.READY;
    case "reconnecting":
      return TranscriptionState.RECONNECTING;
    case "error":
    case "disconnected":
      return TranscriptionState.UNAVAILABLE;
    default:
      return TranscriptionState.NOT_CHECKED;
  }
}

export function sttHealthToTranscription(sttState: string): TranscriptionState {
  switch (sttState) {
    case "STT_CHECKING":
      return TranscriptionState.CONNECTING;
    case "STT_READY":
      return TranscriptionState.READY;
    case "STT_UNAVAILABLE":
    case "STT_ERROR":
      return TranscriptionState.UNAVAILABLE;
    default:
      return TranscriptionState.NOT_CHECKED;
  }
}
