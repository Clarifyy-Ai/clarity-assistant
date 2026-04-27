// src/lib/ai/questionDetection.ts

export interface QuestionDetectionInput {
  transcript: string;
  /** If the UI already knows the question, we just return it. */
  explicitQuestionText?: string;
}

export interface DetectedQuestion {
  questionText: string;
  confidence: number; // 0–1
  source: "explicit" | "heuristic";
}

/**
 * Stage 1 – Detect that a question has been asked.
 * For now, this is a light heuristic over the transcript buffer
 * with an explicit override path.
 * Target latency: ~100ms. [file:1][file:3]
 */
export async function detectQuestion(
  input: QuestionDetectionInput
): Promise<DetectedQuestion | null> {
  const { transcript, explicitQuestionText } = input;

  // 1) Explicit override (e.g., clicked from UI / manual selection)
  if (explicitQuestionText && explicitQuestionText.trim().length > 0) {
    return {
      questionText: explicitQuestionText.trim(),
      confidence: 1,
      source: "explicit",
    };
  }

  // 2) Heuristic: take last sentence ending with '?'
  const text = transcript.trim();
  if (!text) return null;

  const sentences = splitIntoSentences(text);
  const questionCandidates = sentences.filter((s) =>
    s.trim().endsWith("?")
  );
  if (questionCandidates.length === 0) return null;

  const lastQuestion = questionCandidates[questionCandidates.length - 1].trim();

  if (lastQuestion.length < 5) {
    // too short to be meaningful
    return null;
  }

  // Confidence is rough; you can later incorporate diarization metadata.
  const confidence = Math.min(1, Math.max(0.4, lastQuestion.length / 200));

  return {
    questionText: lastQuestion,
    confidence,
    source: "heuristic",
  };
}

/* ──────────────────────────────────────────────────────────────── */

function splitIntoSentences(text: string): string[] {
  // Basic split on punctuation; Deepgram already inserts punctuation per spec. [file:3]
  return text
    .split(/(?<=[\.\?\!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
