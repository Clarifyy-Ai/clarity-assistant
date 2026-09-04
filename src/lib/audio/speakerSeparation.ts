/**
 * Detect weak dual-channel speaker attribution for Live Copilot.
 * Separate from low-STT chat attention — this warns that THEM/YOU
 * separation itself is unreliable.
 */

import type { AudioPipelineStatus, TranscriptUtterance } from "@/types/audio.types";
import { MIN_QUESTION_CONFIDENCE } from "@/lib/audio/liveQuestionGate";
import { isLowConfidenceInterviewerSpeech } from "@/lib/overlay/sessionConversation";

export type SpeakerSeparationInput = {
  isCapturing: boolean;
  /** Tab/system interviewer stream currently present. */
  hasInterviewerChannel: boolean;
  pipelineStatus: AudioPipelineStatus | string | null | undefined;
  utterances?: ReadonlyArray<Pick<
    TranscriptUtterance,
    "speaker" | "text" | "is_final" | "confidence"
  >> | null;
  minConfidence?: number;
  /** How many recent finals to inspect (default 8). */
  recentWindow?: number;
};

/**
 * True when dual-channel is active but speaker labels look unreliable
 * (unknown speakers or low-confidence interviewer speech).
 */
export function isUncertainSpeakerSeparation(
  input: SpeakerSeparationInput,
): boolean {
  if (!input.isCapturing) return false;
  if (!input.hasInterviewerChannel) return false;

  const pipeline = String(input.pipelineStatus ?? "");
  // Mic-only / text / ended means dual attribution is not in play here
  // (OverlaySystemAudioBanner covers missing interviewer audio).
  if (
    pipeline === "microphone_only" ||
    pipeline === "text_only" ||
    pipeline === "unavailable" ||
    pipeline === "ended" ||
    pipeline === "idle"
  ) {
    return false;
  }

  const minConfidence =
    typeof input.minConfidence === "number" && Number.isFinite(input.minConfidence)
      ? input.minConfidence
      : MIN_QUESTION_CONFIDENCE;

  const window = Math.max(3, input.recentWindow ?? 8);
  const recent = (input.utterances ?? [])
    .filter((u) => u.is_final !== false)
    .slice(-window);

  if (recent.length === 0) return false;

  let unknownCount = 0;
  let lowConfidenceInterviewer = false;
  for (const u of recent) {
    if (u.speaker === "unknown") unknownCount += 1;
    if (
      isLowConfidenceInterviewerSpeech({
        speaker: u.speaker,
        text: u.text,
        isFinal: u.is_final,
        confidence: u.confidence,
        hasInterviewerChannel: true,
        minConfidence,
      })
    ) {
      lowConfidenceInterviewer = true;
    }
  }

  // Two+ unknowns in the window, or any low-confidence interviewer finals.
  return unknownCount >= 2 || lowConfidenceInterviewer;
}
