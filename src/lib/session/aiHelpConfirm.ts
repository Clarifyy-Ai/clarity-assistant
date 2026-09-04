import type { TranscriptUtterance } from "@/types/audio.types";
import { resolveQuestionFromTranscript } from "@/lib/session/liveQuestionFromTranscript";

export type AiHelpConfidenceTier = "high" | "medium" | "low";

export type AiHelpConfirmAssessment = {
  question: string;
  confidence: AiHelpConfidenceTier;
  confidenceScore: number | null;
  /** True when question came from recovery / weak attribution (treat as low). */
  usedRecovery: boolean;
};

const HIGH_MIN = 0.7;
const MEDIUM_MIN = 0.45;

/**
 * Map STT confidence (0–1) to High / Medium / Low for the AI Help confirm UI.
 */
export function tierFromConfidenceScore(
  score: number | null | undefined,
  opts?: { minMedium?: number; minHigh?: number },
): AiHelpConfidenceTier {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return "low";
  }
  const high = opts?.minHigh ?? HIGH_MIN;
  const medium = opts?.minMedium ?? MEDIUM_MIN;
  if (score >= high) return "high";
  if (score >= medium) return "medium";
  return "low";
}

export function confidenceTierLabel(tier: AiHelpConfidenceTier): string {
  switch (tier) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    default:
      return "Low";
  }
}

/**
 * Find the utterance that best matches the detected question text.
 */
export function findUtteranceForQuestion(
  utterances: TranscriptUtterance[] | null | undefined,
  question: string,
): TranscriptUtterance | null {
  const q = question.trim().toLowerCase();
  if (!q) return null;
  const list = utterances ?? [];
  const exact = [...list]
    .reverse()
    .find((u) => (u.text ?? "").trim().toLowerCase() === q);
  if (exact) return exact;
  return (
    [...list]
      .reverse()
      .find((u) => {
        const t = (u.text ?? "").trim().toLowerCase();
        return t.length > 0 && (q.includes(t) || t.includes(q));
      }) ?? null
  );
}

/**
 * Assess detected question + confidence for the Manual AI Help confirm panel.
 * Low confidence never auto-generates — caller must wait for explicit Generate Answer.
 */
export function assessAiHelpQuestion(input: {
  utterances: TranscriptUtterance[] | null | undefined;
  currentQuestion?: string | null;
  chatPrefill?: string | null;
  allowMicOnlyFallback?: boolean;
  frozenInterviewerText?: string | null;
  minMedium?: number;
}): AiHelpConfirmAssessment {
  const list = input.utterances ?? [];
  const stored = input.currentQuestion?.trim() ?? "";

  let usedRecovery = false;
  let question = resolveQuestionFromTranscript(list, stored || null, {
    allowMicOnlyFallback: input.allowMicOnlyFallback,
  });

  if (!question) {
    question = resolveQuestionFromTranscript(list, null, {
      allowMicOnlyFallback: true,
      aiHelpRecovery: true,
    });
    if (question) usedRecovery = true;
  }

  if (!question) {
    const prefill = (input.chatPrefill ?? "").trim();
    if (prefill) {
      question = prefill;
      usedRecovery = true;
    }
  }

  if (!question) {
    const frozen = (input.frozenInterviewerText ?? "").trim();
    if (frozen) {
      question = frozen.slice(0, 500);
      usedRecovery = true;
    }
  }

  const matched = findUtteranceForQuestion(list, question);
  let score =
    typeof matched?.confidence === "number" && Number.isFinite(matched.confidence)
      ? matched.confidence
      : null;

  // Do not invent confidence when the matcher has no score.
  // Marked interviewer questions without a score stay null → low/unknown tier.

  let confidence = tierFromConfidenceScore(score, {
    minMedium: input.minMedium ?? MEDIUM_MIN,
  });

  if (usedRecovery && confidence === "high") {
    confidence = "medium";
  }
  if (usedRecovery && !matched?.is_interviewer_question && (score == null || score < HIGH_MIN)) {
    confidence = "low";
  }

  return {
    question,
    confidence,
    confidenceScore: score,
    usedRecovery,
  };
}

/**
 * Join recent interviewer finals into a stable text window (newest last).
 */
export function joinRecentInterviewerText(
  utterances: TranscriptUtterance[] | null | undefined,
  opts?: { maxUtterances?: number; maxChars?: number },
): string {
  const maxU = opts?.maxUtterances ?? 12;
  const maxChars = opts?.maxChars ?? 2_000;
  const recent = (utterances ?? [])
    .filter(
      (u) =>
        u.speaker === "interviewer" &&
        u.is_final !== false &&
        Boolean(u.text?.trim()),
    )
    .slice(-maxU)
    .map((u) => u.text.trim());
  const joined = recent.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length <= maxChars) return joined;
  return joined.slice(-maxChars).trim();
}
