// src/lib/ai/questionDetection.ts

export interface QuestionDetectionInput {
  transcript: string;
  /** If the UI already knows the question, we just return it. */
  explicitQuestionText?: string;
  /** Session-scoped fingerprints already charged / guided (skip duplicates). */
  seenFingerprints?: ReadonlySet<string>;
}

export interface DetectedQuestion {
  questionText: string;
  confidence: number; // 0–1
  source: "explicit" | "heuristic";
  fingerprint: string;
}

/** Normalize question text for duplicate detection within a session. */
export function questionFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

/**
 * Claim auto-hint generation for a fingerprint (StrictMode / rapid re-detect).
 * Returns true only the first time `fingerprint` is claimed on this ref.
 */
export function beginAutoHintIfIdle(
  inflightFingerprintsRef: { current: Set<string> },
  fingerprint: string,
): boolean {
  if (!fingerprint) return false;
  if (inflightFingerprintsRef.current.has(fingerprint)) return false;
  inflightFingerprintsRef.current.add(fingerprint);
  return true;
}

/** Stable client idempotency key for hint generation (session + fingerprint).
 * Must match edge `isValidIdempotencyKey`: /^[A-Za-z0-9._:-]{16,150}$/
 * (spaces in fingerprints previously caused CREDIT_DEDUCTION_FAILED 500s).
 */
export function hintIdempotencyKey(
  sessionId: string | null | undefined,
  questionText: string,
): string {
  const fpRaw = questionFingerprint(questionText) || "empty";
  const fp = fpRaw
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._:-]/g, "")
    .slice(0, 80) || "empty";
  const sid = (sessionId?.trim() || "local")
    .replace(/[^A-Za-z0-9._:-]/g, "")
    .slice(0, 40) || "local";
  return `generate-hint:${sid}:${fp}`.slice(0, 150);
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
  const { transcript, explicitQuestionText, seenFingerprints } = input;

  // 1) Explicit override (e.g., clicked from UI / manual selection)
  if (explicitQuestionText && explicitQuestionText.trim().length > 0) {
    const questionText = explicitQuestionText.trim();
    const fingerprint = questionFingerprint(questionText);
    if (seenFingerprints?.has(fingerprint)) return null;
    return {
      questionText,
      confidence: 1,
      source: "explicit",
      fingerprint,
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

  // Walk newest → oldest until we find a non-duplicate candidate.
  for (let i = questionCandidates.length - 1; i >= 0; i--) {
    const lastQuestion = questionCandidates[i].trim();
    if (lastQuestion.length < 5) continue;
    const fingerprint = questionFingerprint(lastQuestion);
    if (seenFingerprints?.has(fingerprint)) continue;
    const confidence = Math.min(1, Math.max(0.4, lastQuestion.length / 200));
    return {
      questionText: lastQuestion,
      confidence,
      source: "heuristic",
      fingerprint,
    };
  }

  return null;
}

/* ──────────────────────────────────────────────────────────────── */

function splitIntoSentences(text: string): string[] {
  // Basic split on punctuation; Deepgram already inserts punctuation per spec. [file:3]
  return text
    .split(/(?<=[\.\?\!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
