import type { TranscriptUtterance } from "@/types/audio.types";

export type LiveAnswerRow = {
  question: string;
  answer: string;
  duration_ms: number;
};

const QUESTION_LEAD_IN =
  /^(tell me|walk me|describe|explain|what|how|why)\b/i;

function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  return QUESTION_LEAD_IN.test(t);
}

function isQuestionStart(utterance: TranscriptUtterance): boolean {
  if (utterance.is_interviewer_question) return true;
  return utterance.speaker === "interviewer" && looksLikeQuestion(utterance.text ?? "");
}

export function countAnsweredPairs(rows: LiveAnswerRow[]): number {
  return rows.filter((row) => row.question.trim().length > 0 && row.answer.trim().length > 0)
    .length;
}

export function pairLiveSessionAnswers(
  utterances: TranscriptUtterance[],
): LiveAnswerRow[] {
  const rows: LiveAnswerRow[] = [];
  let question = "";
  let answerParts: string[] = [];
  let firstCandidateStart: number | null = null;
  let lastCandidateEnd: number | null = null;

  const reset = () => {
    question = "";
    answerParts = [];
    firstCandidateStart = null;
    lastCandidateEnd = null;
  };

  const flush = () => {
    const q = question.trim();
    const a = answerParts.join(" ").trim();
    if (!q || !a) {
      reset();
      return;
    }
    if (rows.length > 0 && rows[rows.length - 1].question === q) {
      reset();
      return;
    }
    const duration_ms =
      firstCandidateStart != null && lastCandidateEnd != null
        ? Math.max(0, lastCandidateEnd - firstCandidateStart)
        : 0;
    rows.push({ question: q, answer: a, duration_ms });
    reset();
  };

  for (const utterance of utterances) {
    if (utterance.is_final === false) continue;

    if (isQuestionStart(utterance)) {
      flush();
      question = utterance.text ?? "";
      continue;
    }

    if (!question || utterance.speaker !== "candidate") continue;

    const text = (utterance.text ?? "").trim();
    if (text) answerParts.push(text);

    if (typeof utterance.start_ms === "number") {
      if (firstCandidateStart == null) firstCandidateStart = utterance.start_ms;
    }
    if (typeof utterance.end_ms === "number") {
      lastCandidateEnd = utterance.end_ms;
    }
  }

  flush();
  return rows;
}
