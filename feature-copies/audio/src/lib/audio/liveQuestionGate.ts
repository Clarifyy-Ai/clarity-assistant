/**
 * Live Copilot question gate — interviewer channel only.
 *
 * Auto-detection must never treat candidate / unknown speech as an
 * interviewer question. Silence only finalizes an already-gated candidate.
 */

import { isInterviewerQuestionText } from "./interviewerQuestion";
import type { Speaker, TranscriptUtterance } from "@/types/audio.types";

/** Speech / question pipeline events (Live). */
export type LiveSpeechEvent =
  | "NO_AUDIO"
  | "CANDIDATE_SPEAKING"
  | "INTERVIEWER_SPEAKING"
  | "QUESTION_CANDIDATE"
  | "QUESTION_FINALIZED";

/** Minimum Deepgram confidence for auto question finalize. */
export const MIN_QUESTION_CONFIDENCE = 0.45;

export interface LiveQuestionGateInput {
  speaker: Speaker | null | undefined;
  text: string | null | undefined;
  isFinal?: boolean;
  confidence?: number | null;
  /** True when a dedicated interviewer (tab/system) STT channel is active. */
  hasInterviewerChannel: boolean;
}

/**
 * Whether this utterance may enter the silence-finalize question path.
 * Candidate and unknown speakers never qualify — even if the text looks
 * like a question (candidate may ask clarifying questions).
 */
export function canBecomeInterviewerQuestion(
  input: LiveQuestionGateInput,
): boolean {
  if (!input.hasInterviewerChannel) return false;
  if (input.isFinal === false) return false;
  if (input.speaker !== "interviewer") return false;

  const text = (input.text ?? "").trim();
  if (!isInterviewerQuestionText(text)) return false;

  const confidence = input.confidence;
  if (
    typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence > 0 &&
    confidence < MIN_QUESTION_CONFIDENCE
  ) {
    return false;
  }

  return true;
}

export function gateUtteranceAsInterviewerQuestion(
  utterance: TranscriptUtterance,
  hasInterviewerChannel: boolean,
): boolean {
  return canBecomeInterviewerQuestion({
    speaker: utterance.speaker,
    text: utterance.text,
    isFinal: utterance.is_final,
    confidence: utterance.confidence,
    hasInterviewerChannel,
  });
}

/** Build a unique client operation id for a hint request (stale-stream guard). */
export function createLiveHintOperationId(
  sessionId: string | null | undefined,
  questionId: string,
): string {
  const sid = (sessionId?.trim() || "local").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 36);
  const qid = questionId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 48);
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `hint-op:${sid}:${qid}:${nonce}`.slice(0, 150);
}
