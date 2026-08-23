import { isInterviewerQuestionText } from "@/lib/audio/interviewerQuestion";
import type { TranscriptUtterance } from "@/types/audio.types";

/**
 * Pick the interviewer question the coach should answer from live transcript.
 * Prefers marked interviewer questions, then interviewer speech.
 * Mic-only fallback: only when tab audio was never expected (Mock / no system audio).
 */
export function resolveQuestionFromTranscript(
  utterances: TranscriptUtterance[] | null | undefined,
  currentQuestion?: string | null,
  options?: { allowMicOnlyFallback?: boolean },
): string {
  const stored = currentQuestion?.trim() ?? "";
  if (stored) return stored;

  const list = utterances ?? [];
  if (list.length === 0) return "";

  const lastMarked = [...list]
    .reverse()
    .find((u) => u.is_interviewer_question && u.text?.trim());
  if (lastMarked?.text?.trim()) return lastMarked.text.trim();

  const lastInterviewer = [...list]
    .reverse()
    .find((u) => u.speaker === "interviewer" && u.text?.trim());
  if (lastInterviewer?.text?.trim()) return lastInterviewer.text.trim();

  // Do not treat candidate-labelled speech as an interviewer question in Live
  // (mic-only with enable_system_audio would mis-attribute).
  if (!options?.allowMicOnlyFallback) return "";

  const lastQuestionShaped = [...list]
    .reverse()
    .find((u) => isInterviewerQuestionText(u.text ?? ""));
  if (lastQuestionShaped?.text?.trim()) return lastQuestionShaped.text.trim();

  const recent = list
    .slice(-4)
    .map((u) => u.text?.trim())
    .filter(Boolean);
  return recent.join(" ").trim();
}
