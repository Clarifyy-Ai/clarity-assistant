import { SKIPPED_ANSWER_SENTINEL } from "@/lib/mock/mockSessionProgress";

export type ScorecardEvalStatus = "processing" | "failed" | "not_scored" | "scored";

export type SessionAnswerLike = {
  session_id?: string | null;
  question?: string | null;
  answer?: string | null;
  question_index?: number | null;
};

export type AssociatedAnswer = {
  session_id: string;
  question: string;
  answer: string;
  question_index: number;
};

function trimAnswer(value: unknown): string {
  return String(value ?? "").trim();
}

export function isScorableAnswerText(answer: string | null | undefined): boolean {
  const t = trimAnswer(answer);
  if (!t) return false;
  if (t === SKIPPED_ANSWER_SENTINEL) return false;
  return true;
}

/** Bind answers to one session and drop empties / other sessions. */
export function associateAnswersForSession(
  sessionId: string,
  rows: SessionAnswerLike[] | null | undefined,
): AssociatedAnswer[] {
  const sid = sessionId.trim();
  if (!sid) return [];
  const out: AssociatedAnswer[] = [];
  (rows ?? []).forEach((row, i) => {
    if (row.session_id && String(row.session_id) !== sid) return;
    const answer = trimAnswer(row.answer);
    if (!isScorableAnswerText(answer)) return;
    out.push({
      session_id: sid,
      question: trimAnswer(row.question) || `Question ${i + 1}`,
      answer,
      question_index:
        typeof row.question_index === "number" && Number.isFinite(row.question_index)
          ? row.question_index
          : i,
    });
  });
  return out.sort((a, b) => a.question_index - b.question_index);
}

export function evaluationStatusFromCounts(opts: {
  scorableAnswers: number;
  persistedQuestionScores: number;
  failed?: boolean;
  processing?: boolean;
}): ScorecardEvalStatus {
  if (opts.failed) return "failed";
  if (opts.processing) return "processing";
  if (opts.scorableAnswers === 0) return "not_scored";
  if (opts.persistedQuestionScores > 0) return "scored";
  return "not_scored";
}

export function shouldRetryEvaluation(status: ScorecardEvalStatus): boolean {
  return status === "failed" || status === "not_scored";
}

export function describeEvaluation(opts: {
  status: ScorecardEvalStatus;
  scorableAnswers: number;
  persistedQuestionScores: number;
  error?: string | null;
}): string {
  if (opts.status === "processing") {
    return "Scoring is still running on the server. This page will refresh when it finishes.";
  }
  if (opts.status === "failed") {
    return opts.error?.trim() || "Scoring failed. Retry when you are ready. Scores are not invented in the browser.";
  }
  if (opts.status === "not_scored" && opts.scorableAnswers === 0) {
    return "No answers were recorded for this session, so a scorecard cannot be generated.";
  }
  if (opts.status === "not_scored") {
    return `${opts.scorableAnswers} answer(s) are saved, but no scorecard dimensions were persisted yet.`;
  }
  return `Scored ${opts.persistedQuestionScores} of ${opts.scorableAnswers} answered questions.`;
}
