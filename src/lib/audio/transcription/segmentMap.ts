import { generateId } from "@/lib/utils";
import type { Speaker, TranscriptUtterance } from "@/types/audio.types";
import type { TranscriptSegment, TranscriptionChannel } from "./types";

export function channelToSpeaker(channel: TranscriptionChannel): Speaker {
  return channel === "interviewer" ? "interviewer" : "candidate";
}

export function utteranceToSegment(
  utterance: TranscriptUtterance,
  sessionId: string,
  sequence: number,
): TranscriptSegment {
  return {
    sessionId,
    segmentId: utterance.id,
    startMs: utterance.start_ms,
    endMs: utterance.end_ms,
    text: utterance.text,
    isFinal: utterance.is_final,
    confidence: utterance.confidence,
    speaker: utterance.speaker,
    sequence,
  };
}

export function partialTextToSegment(
  sessionId: string,
  text: string,
  channel: TranscriptionChannel,
  sequence: number,
): TranscriptSegment {
  const now = Date.now();
  return {
    sessionId,
    segmentId: `partial-${sequence}`,
    startMs: now,
    endMs: now,
    text,
    isFinal: false,
    speaker: channelToSpeaker(channel),
    sequence,
  };
}

export function newUtteranceFromSegment(
  segment: TranscriptSegment,
  channel: TranscriptionChannel,
): TranscriptUtterance {
  return {
    id: segment.segmentId || generateId(),
    speaker: channelToSpeaker(channel),
    text: segment.text,
    words: [],
    start_ms: segment.startMs,
    end_ms: segment.endMs,
    is_final: segment.isFinal,
    is_interviewer_question: false,
    confidence: segment.confidence ?? 0,
  };
}
