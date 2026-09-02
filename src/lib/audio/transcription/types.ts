/**
 * Normalized live transcription model used by the Practice Coach overlay.
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

export type LiveTranscriptionCallbacks = {
  onPartial: (segment: TranscriptSegment, channel: TranscriptionChannel) => void;
  onFinal: (segment: TranscriptSegment, channel: TranscriptionChannel) => void;
  onStatusChange: (status: TranscriptionProviderStatus, channel?: TranscriptionChannel) => void;
  onError: (error: Error, recoverable: boolean, channel?: TranscriptionChannel) => void;
};

export type LiveTranscriptionServiceOptions = {
  sessionId: string;
  correlationId?: string;
  callbacks: LiveTranscriptionCallbacks;
};
