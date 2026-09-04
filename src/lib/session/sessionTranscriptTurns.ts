/**
 * Session History transcript turns — prefer speaker-attributed utterances
 * (THEM / YOU), fall back to flat content, and attach AI suggestions from
 * session_answers when available.
 */

import type { Speaker, TranscriptUtterance } from "@/types/audio.types";
import { pairLiveSessionAnswers } from "@/lib/session/liveSessionAnswers";

export type TranscriptTurnLabel = "THEM" | "YOU" | "AI" | "…";

export type TranscriptTurn = {
  id: string;
  label: TranscriptTurnLabel;
  role: "interviewer" | "candidate" | "ai" | "unknown";
  text: string;
  start_ms: number | null;
  speaker: Speaker | null;
};

export type SessionTurnGroup = {
  id: string;
  questionIndex: number;
  interviewer: string;
  candidate: string;
  aiSuggestion: string | null;
};

export type SessionAnswerLike = {
  question?: string | null;
  answer?: string | null;
  ai_feedback?: string | null;
  question_index?: number | null;
};

export type SessionTranscriptView = {
  mode: "turns" | "flat" | "empty";
  turns: TranscriptTurn[];
  groups: SessionTurnGroup[];
  flatContent: string | null;
};

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function labelForSpeaker(speaker: Speaker | null | undefined): TranscriptTurnLabel {
  if (speaker === "interviewer") return "THEM";
  if (speaker === "candidate") return "YOU";
  return "…";
}

function roleForSpeaker(
  speaker: Speaker | null | undefined,
): TranscriptTurn["role"] {
  if (speaker === "interviewer") return "interviewer";
  if (speaker === "candidate") return "candidate";
  return "unknown";
}

/** Normalize persisted utterance blobs from session_transcripts.utterances. */
export function parsePersistedUtterances(raw: unknown): TranscriptUtterance[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptUtterance[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const text = asTrimmed(rec.text);
    if (!text) continue;
    const speakerRaw = String(rec.speaker ?? "unknown");
    const speaker: Speaker =
      speakerRaw === "interviewer" || speakerRaw === "candidate"
        ? speakerRaw
        : "unknown";
    out.push({
      id: typeof rec.id === "string" && rec.id ? rec.id : `utt-${i}`,
      speaker,
      text,
      words: Array.isArray(rec.words) ? (rec.words as TranscriptUtterance["words"]) : [],
      start_ms: typeof rec.start_ms === "number" ? rec.start_ms : 0,
      end_ms: typeof rec.end_ms === "number" ? rec.end_ms : 0,
      is_final: rec.is_final !== false,
      is_interviewer_question: rec.is_interviewer_question === true,
      confidence: typeof rec.confidence === "number" ? rec.confidence : 1,
      filler_word_count:
        typeof rec.filler_word_count === "number" ? rec.filler_word_count : undefined,
      filler_words_used: Array.isArray(rec.filler_words_used)
        ? (rec.filler_words_used as string[])
        : undefined,
    });
  }
  return out;
}

/**
 * Collapse consecutive final utterances from the same speaker into display turns.
 */
export function buildUtteranceTurns(
  utterances: ReadonlyArray<TranscriptUtterance>,
): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;

  for (const u of utterances) {
    if (u.is_final === false) continue;
    const text = asTrimmed(u.text);
    if (!text) continue;

    const label = labelForSpeaker(u.speaker);
    const role = roleForSpeaker(u.speaker);
    if (current && current.role === role && current.label === label) {
      current.text = `${current.text} ${text}`.trim();
      continue;
    }

    current = {
      id: u.id || `turn-${turns.length}`,
      label,
      role,
      text,
      start_ms: typeof u.start_ms === "number" ? u.start_ms : null,
      speaker: u.speaker ?? null,
    };
    turns.push(current);
  }

  return turns;
}

function normalizeQuestionKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Group interviewer + candidate + AI suggestion using liveSessionAnswers pairing
 * and session_answers.ai_feedback when present.
 */
export function buildSessionTurnGroups(input: {
  utterances: ReadonlyArray<TranscriptUtterance>;
  answers?: ReadonlyArray<SessionAnswerLike> | null;
}): SessionTurnGroup[] {
  const pairs = pairLiveSessionAnswers([...input.utterances]);
  const answers = input.answers ?? [];

  const feedbackByQuestion = new Map<string, string>();
  const feedbackByIndex = new Map<number, string>();
  for (const row of answers) {
    const feedback = asTrimmed(row.ai_feedback);
    if (!feedback) continue;
    const q = asTrimmed(row.question);
    if (q) feedbackByQuestion.set(normalizeQuestionKey(q), feedback);
    if (typeof row.question_index === "number") {
      feedbackByIndex.set(row.question_index, feedback);
    }
  }

  if (pairs.length > 0) {
    return pairs.map((pair, i) => ({
      id: `group-${i}`,
      questionIndex: i,
      interviewer: pair.question,
      candidate: pair.answer,
      aiSuggestion:
        feedbackByQuestion.get(normalizeQuestionKey(pair.question)) ??
        feedbackByIndex.get(i) ??
        null,
    }));
  }

  // No utterance pairs — fall back to persisted session_answers rows.
  return answers
    .map((row, i) => {
      const interviewer = asTrimmed(row.question);
      const candidate = asTrimmed(row.answer);
      if (!interviewer && !candidate) return null;
      return {
        id: `answer-${typeof row.question_index === "number" ? row.question_index : i}`,
        questionIndex:
          typeof row.question_index === "number" ? row.question_index : i,
        interviewer,
        candidate,
        aiSuggestion: asTrimmed(row.ai_feedback) || null,
      } satisfies SessionTurnGroup;
    })
    .filter((g): g is SessionTurnGroup => g != null)
    .sort((a, b) => a.questionIndex - b.questionIndex);
}

/**
 * Prefer persisted utterances; otherwise flat content; otherwise empty.
 */
export function buildSessionTranscriptView(input: {
  utterances?: unknown;
  content?: string | null;
  answers?: ReadonlyArray<SessionAnswerLike> | null;
}): SessionTranscriptView {
  const parsed = parsePersistedUtterances(input.utterances);
  const flatContent = asTrimmed(input.content) || null;
  const groups = buildSessionTurnGroups({
    utterances: parsed,
    answers: input.answers,
  });

  if (parsed.length > 0) {
    const turns = buildUtteranceTurns(parsed);
    // Attach AI suggestion turns after matching YOU turns when groups exist.
    const withAi: TranscriptTurn[] = [];
    const usedSuggestions = new Set<string>();
    for (const turn of turns) {
      withAi.push(turn);
      if (turn.role !== "candidate") continue;
      const match = groups.find(
        (g) =>
          g.aiSuggestion &&
          !usedSuggestions.has(g.id) &&
          (normalizeQuestionKey(g.candidate) === normalizeQuestionKey(turn.text) ||
            turn.text.includes(g.candidate) ||
            g.candidate.includes(turn.text)),
      );
      if (match?.aiSuggestion) {
        usedSuggestions.add(match.id);
        withAi.push({
          id: `ai-${match.id}`,
          label: "AI",
          role: "ai",
          text: match.aiSuggestion,
          start_ms: null,
          speaker: null,
        });
      }
    }
    return {
      mode: "turns",
      turns: withAi,
      groups,
      flatContent,
    };
  }

  if (flatContent) {
    return { mode: "flat", turns: [], groups, flatContent };
  }

  return { mode: "empty", turns: [], groups, flatContent: null };
}
