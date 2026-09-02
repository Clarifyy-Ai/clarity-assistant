/**
 * Provider-neutral live transcription model (Parakeet boundary).
 * Deepgram (or future STT backends) normalize into these shapes.
 */

export type TranscriptSegment = {
  sessionId: string;
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
  isFinal: boolean;
  confidence?: number;
  speaker?: string;
  sequence: number;
};

export type TranscriptionChannel = "candidate" | "interviewer";

export type TranscriptionProviderStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "paused"
  | "unavailable"
  | "error"
  | "ended";

export type ParakeetTranscriptionCallbacks = {
  onPartial: (segment: TranscriptSegment, channel: TranscriptionChannel) => void;
  onFinal: (segment: TranscriptSegment, channel: TranscriptionChannel) => void;
  onStatusChange: (status: TranscriptionProviderStatus, channel?: TranscriptionChannel) => void;
  onError: (error: Error, recoverable: boolean, channel?: TranscriptionChannel) => void;
};

export type ParakeetTranscriptionServiceOptions = {
  sessionId: string;
  correlationId?: string;
  callbacks: ParakeetTranscriptionCallbacks;
};
