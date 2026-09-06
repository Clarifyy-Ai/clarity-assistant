/**
 * Candidate answer capture for Mock Interview.
 *
 * Distinguishes INTERVIEWER_AUDIO (injected + TTS) from CANDIDATE_AUDIO (mic STT).
 * Never treats silence alone as a valid answer.
 */

import type { TranscriptUtterance } from "@/types/audio.types";
import {
  deriveFinalizationOutcome,
  deriveMockAnswerStatus,
  type AnswerFinalizationOutcome,
  type MockAnswerStatus,
} from "@/lib/mock/answerNextFsm";
import { normalizeQuestionText } from "@/lib/mock/validateGeneratedQuestion";

export type CapturedMockAnswer = {
  answer_text: string;
  status: MockAnswerStatus;
  outcome: AnswerFinalizationOutcome;
  skipped: boolean;
};

/** Deepgram stream offsets stay well below one day; wall-clock ms (Date.now()) must be ignored. */
export const MAX_STREAM_OFFSET_MS = 86_400_000;

function isStreamRelativeTimestampMs(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_STREAM_OFFSET_MS;
}

function normalizeForCompare(text: string): string {
  return normalizeQuestionText(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "");
}

/**
 * Detect when mic STT is echoing the interviewer question (browser TTS → speakers → mic).
 */
export function looksLikeInterviewerEcho(
  candidateText: string,
  questionText: string,
): boolean {
  const a = normalizeForCompare(candidateText);
  const q = normalizeForCompare(questionText);
  if (!a || !q) return false;
  if (a === q) return true;
  if (a.length >= 12 && (q.includes(a) || a.includes(q))) return true;

  const aTokens = a.split(/\s+/).filter((w) => w.length > 2);
  const qTokens = q.split(/\s+/).filter((w) => w.length > 2);
  if (qTokens.length === 0 || aTokens.length === 0) return false;

  const aWords = new Set(aTokens);
  const overlap = qTokens.filter((w) => aWords.has(w)).length;
  const ratioQ = overlap / qTokens.length;
  const ratioA = overlap / aTokens.length;
  // High lexical overlap with the question ⇒ almost certainly TTS echo.
  if (ratioQ >= 0.6 && overlap >= 4) return true;
  // Candidate is mostly a subset of the question wording.
  if (ratioA >= 0.75 && overlap >= 4 && a.length >= 20) return true;
  return false;
}

/**
 * Stream-relative watermark for the current listening window.
 *
 * Deepgram utterance `start_ms` / `end_ms` are audio-stream offsets (not wall clock).
 * Call this when candidate listening opens so filters share the same time domain.
 * Do NOT use `Date.now()` here — that rejects every real Deepgram final.
 */
export function streamListeningWatermarkMs(
  utterances: ReadonlyArray<Pick<TranscriptUtterance, "start_ms" | "end_ms">>,
): number {
  let max = 0;
  for (const u of utterances) {
    const end = isStreamRelativeTimestampMs(u.end_ms) ? u.end_ms : null;
    const start = isStreamRelativeTimestampMs(u.start_ms) ? u.start_ms : null;
    const t = end ?? start;
    if (t != null && t > max) max = t;
  }
  return Math.max(0, max);
}

/**
 * Collect candidate STT only from the current question's listening window.
 * Excludes interviewer utterances and TTS-echo fragments.
 *
 * `listeningStartedAtMs` must be stream-relative (see {@link streamListeningWatermarkMs}),
 * matching `TranscriptUtterance.start_ms` / `end_ms` — never wall-clock epoch ms.
 */
export function collectCandidateAnswerText(options: {
  utterances: ReadonlyArray<TranscriptUtterance>;
  interimText?: string | null;
  /** Stream-relative watermark; same domain as utterance start_ms/end_ms. */
  listeningStartedAtMs: number | null;
  questionText: string;
  /** When true, ignore all mic content (TTS still playing). */
  interviewerAudioActive?: boolean;
  typedAnswer?: string | null;
  /**
   * When false, ignore typedAnswer and return voice-only draft (for live UI sync).
   * Default true: typed answer wins over STT when present.
   */
  preferTyped?: boolean;
}): string {
  if (options.interviewerAudioActive) {
    return (options.typedAnswer ?? "").trim();
  }

  const preferTyped = options.preferTyped !== false;
  const typed = (options.typedAnswer ?? "").trim();
  if (preferTyped && typed) return typed;

  // Listening window never opened (e.g. Next during TTS) → no candidate STT.
  if (options.listeningStartedAtMs == null) {
    return "";
  }

  const windowStart = options.listeningStartedAtMs;
  const parts: string[] = [];

  for (const u of options.utterances) {
    if (!u.is_final) continue;
    if (u.speaker !== "candidate") continue;
    if (u.is_interviewer_question) continue;
    // Prefer end_ms; fall back to start_ms. Drop anything before listening opened.
    const end = isStreamRelativeTimestampMs(u.end_ms) ? u.end_ms : null;
    const start = isStreamRelativeTimestampMs(u.start_ms) ? u.start_ms : null;
    const t = end ?? start;
    if (t == null || t < windowStart) continue;
    const text = (u.text ?? "").trim();
    if (!text) continue;
    if (looksLikeInterviewerEcho(text, options.questionText)) continue;
    parts.push(text);
  }

  let joined = parts.join(" ").trim();
  if (!joined) {
    const interim = (options.interimText ?? "").trim();
    if (
      interim &&
      !looksLikeInterviewerEcho(interim, options.questionText)
    ) {
      joined = interim;
    }
  }

  return joined;
}

export function finalizeMockAnswer(options: {
  skipped?: boolean;
  utterances: ReadonlyArray<TranscriptUtterance>;
  interimText?: string | null;
  listeningStartedAtMs: number | null;
  questionText: string;
  interviewerAudioActive?: boolean;
  typedAnswer?: string | null;
  timedOut?: boolean;
  preferTyped?: boolean;
}): CapturedMockAnswer {
  if (options.skipped) {
    return {
      answer_text: "",
      status: "skipped",
      outcome: "SKIPPED",
      skipped: true,
    };
  }

  const text = collectCandidateAnswerText(options);
  const hadSignal = Boolean(text) || Boolean((options.interimText ?? "").trim());
  const status = deriveMockAnswerStatus({ text, hadSignal, skipped: false });
  const outcome = deriveFinalizationOutcome({
    status,
    hadSignal,
    timedOut: options.timedOut,
  });

  // Silence / empty → unanswered (never auto-"answered").
  if (status !== "answered") {
    return {
      answer_text: status === "invalid" ? text : "",
      status: status === "invalid" ? "invalid" : "unanswered",
      outcome: status === "invalid" ? "INVALID" : outcome === "NO_SIGNAL" ? "NO_SIGNAL" : "UNANSWERED",
      skipped: false,
    };
  }

  return {
    answer_text: text,
    status: "answered",
    outcome: "VALID_ANSWER",
    skipped: false,
  };
}

const NON_SUBSTANTIVE_ANSWERS = new Set([
  "hello",
  "hi",
  "hey",
  "um",
  "uh",
  "hmm",
  "yes",
  "no",
  "ok",
  "okay",
  "thanks",
  "thank you",
]);

/** Greetings / fillers that should not count as a real answer to an interview question. */
export function isNonSubstantiveAnswer(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
  if (!normalized) return true;
  if (NON_SUBSTANTIVE_ANSWERS.has(normalized)) return true;
  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 2 && normalized.length < 16;
}

/** Soft draft status while the candidate is still speaking / typing. */
export function draftMockAnswerStatus(text: string): MockAnswerStatus {
  const t = text.trim();
  if (!t) return "unanswered";
  if (t.length < 3) return "draft";
  return "draft";
}
