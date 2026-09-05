import { useAudioStore } from "@/store/audioStore";
import { isInterviewerQuestionText } from "@/lib/audio/interviewerQuestion";
import type { TranscriptUtterance } from "@/types/audio.types";

export type LatestInterviewerQuestion = {
  /** Latest finalized interviewer question text (never candidate speech). */
  question: string;
  /** True when interim interviewer speech is still open in the STT pipeline. */
  isFinalizing: boolean;
  confidence: number | null;
  utteranceId: string | null;
};

function isCandidateUtterance(u: TranscriptUtterance): boolean {
  return u.speaker === "candidate";
}

function isFinalizedInterviewerQuestion(u: TranscriptUtterance): boolean {
  if (isCandidateUtterance(u)) return false;
  if (u.is_final === false) return false;
  const text = u.text?.trim();
  if (!text) return false;
  if (u.is_interviewer_question) return true;
  if (u.speaker === "interviewer") {
    return isInterviewerQuestionText(text) || text.endsWith("?");
  }
  return false;
}

function findLatestFinalizedQuestion(
  utterances: TranscriptUtterance[],
): TranscriptUtterance | null {
  for (let i = utterances.length - 1; i >= 0; i -= 1) {
    const u = utterances[i];
    if (isFinalizedInterviewerQuestion(u)) return u;
  }
  return null;
}

function hasOpenInterim(interimText: string): boolean {
  return Boolean(interimText.trim());
}

/**
 * Read the latest finalized interviewer question from audioStore utterances.
 * Returns null when no valid interviewer question exists yet.
 */
export function getLatestInterviewerQuestion(
  overrides?: {
    utterances?: TranscriptUtterance[];
    interimText?: string;
  },
): LatestInterviewerQuestion | null {
  const audio = useAudioStore.getState();
  const utterances = overrides?.utterances ?? audio.transcript?.utterances ?? [];
  const interimText = overrides?.interimText ?? audio.transcript?.interim_text ?? "";

  const latest = findLatestFinalizedQuestion(utterances);
  const question = latest?.text?.trim() ?? "";
  if (!question) return null;

  const confidence =
    typeof latest?.confidence === "number" && Number.isFinite(latest.confidence)
      ? latest.confidence
      : null;

  return {
    question,
    isFinalizing: hasOpenInterim(interimText),
    confidence,
    utteranceId: latest?.id ?? null,
  };
}

/** True when a finalized interviewer question is available for AI Help. */
export function hasValidInterviewerQuestion(
  overrides?: Parameters<typeof getLatestInterviewerQuestion>[0],
): boolean {
  return Boolean(getLatestInterviewerQuestion(overrides)?.question.trim());
}
