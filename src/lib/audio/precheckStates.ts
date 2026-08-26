/**
 * Canonical device / transcription pre-check states.
 * Physical microphone readiness is independent of remote STT health.
 */

export const MicState = {
  NOT_CHECKED: "NOT_CHECKED",
  CHECKING: "CHECKING",
  READY: "READY",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NO_SIGNAL: "NO_SIGNAL",
  DEVICE_UNAVAILABLE: "DEVICE_UNAVAILABLE",
  BROWSER_UNSUPPORTED: "BROWSER_UNSUPPORTED",
  ERROR: "ERROR",
} as const;

export type MicState = (typeof MicState)[keyof typeof MicState];

export const SpeakerState = {
  NOT_CHECKED: "NOT_CHECKED",
  CHECKING: "CHECKING",
  READY: "READY",
  PLAYBACK_BLOCKED: "PLAYBACK_BLOCKED",
  DEVICE_UNAVAILABLE: "DEVICE_UNAVAILABLE",
  ERROR: "ERROR",
} as const;

export type SpeakerState = (typeof SpeakerState)[keyof typeof SpeakerState];

export const AiState = {
  AI_NOT_CHECKED: "AI_NOT_CHECKED",
  AI_READY: "AI_READY",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
} as const;

export type AiState = (typeof AiState)[keyof typeof AiState];

export const AI_STATUS_COPY: Record<AiState, string> = {
  AI_NOT_CHECKED: "Coaching availability not checked",
  AI_READY: "Coaching ready",
  AI_UNAVAILABLE: "Coaching temporarily unavailable",
};

export const SttState = {
  STT_NOT_CHECKED: "STT_NOT_CHECKED",
  STT_CHECKING: "STT_CHECKING",
  STT_READY: "STT_READY",
  STT_RECEIVING_AUDIO: "STT_RECEIVING_AUDIO",
  STT_TRANSCRIBING: "STT_TRANSCRIBING",
  STT_RECONNECTING: "STT_RECONNECTING",
  STT_UNAVAILABLE: "STT_UNAVAILABLE",
  STT_ERROR: "STT_ERROR",
} as const;

export type SttState = (typeof SttState)[keyof typeof SttState];

export const MIC_STATUS_COPY: Record<MicState, string> = {
  NOT_CHECKED: "Microphone not checked",
  CHECKING: "Checking microphone…",
  READY: "Microphone ready",
  PERMISSION_DENIED: "Permission denied",
  NO_SIGNAL: "No microphone signal detected",
  DEVICE_UNAVAILABLE: "Microphone unavailable",
  BROWSER_UNSUPPORTED: "Microphone is not supported in this browser",
  ERROR: "Microphone check failed",
};

export const SPEAKER_STATUS_COPY: Record<SpeakerState, string> = {
  NOT_CHECKED: "Speakers not checked",
  CHECKING: "Playing speaker test…",
  READY: "Speaker ready",
  PLAYBACK_BLOCKED: "Click Play Test to verify your speakers.",
  DEVICE_UNAVAILABLE: "Speaker output unavailable",
  ERROR: "Speaker test failed",
};

export const STT_STATUS_COPY: Record<SttState, string> = {
  STT_NOT_CHECKED: "Transcription not checked",
  STT_CHECKING: "Connecting to transcription…",
  STT_READY: "Transcription ready",
  STT_RECEIVING_AUDIO: "Receiving audio",
  STT_TRANSCRIBING: "Transcribing",
  STT_RECONNECTING: "Reconnecting transcription…",
  STT_UNAVAILABLE: "Transcription temporarily unavailable — text mode still works",
  STT_ERROR: "Transcription temporarily unavailable — text mode still works",
};

export const MIC_PERMISSION_RECOVERY =
  "Allow microphone access in your browser settings, then select Recheck.";

/** Contextual note — never use as the primary mic status line. */
export const MIC_READY_STT_UNAVAILABLE =
  "Your microphone works. Transcription is unavailable — you can use text mode.";

export function isMicHardwareReady(state: MicState): boolean {
  return state === MicState.READY;
}

export function isMicPermissionDenied(state: MicState): boolean {
  return state === MicState.PERMISSION_DENIED;
}

/** Session voice start requires local mic + speaker. STT must never gate this. */
export function isLocalAudioReadyForVoice(
  mic: MicState,
  speaker: SpeakerState,
): boolean {
  return mic === MicState.READY && speaker === SpeakerState.READY;
}

/** @deprecated Prefer separate MIC_STATUS_COPY and STT_STATUS_COPY in UI. */
export function micAndSttSummary(mic: MicState, stt: SttState): string {
  return MIC_STATUS_COPY[mic];
}

export function createOperationGuard(): {
  next: () => { id: number; isCurrent: () => boolean };
  invalidate: () => void;
} {
  let seq = 0;
  return {
    next() {
      const id = ++seq;
      return { id, isCurrent: () => id === seq };
    },
    invalidate() {
      seq += 1;
    },
  };
}
