/**
 * Phase 3: durable turn / evaluation shape stored alongside session progress.
 * Prefer evolving shared sessions + scorecards; this models the acceptance schema.
 */

export type DurableMockTurn = {
  question_id: string;
  sequence: number;
  parent_question_id: string | null;
  is_follow_up: boolean;
  question_text: string;
  competency: string | null;
  answer_text: string;
  answer_source: "spoken" | "typed" | "mixed" | "skipped" | "unanswered";
  finalized_at: string;
};

export type DurableMockEvalStub = {
  session_id: string;
  question_id: string;
  status: "queued" | "processing" | "completed" | "failed_retryable" | "failed_permanent" | "not_eligible";
  rubric_version: string;
};

export function buildDurableTurnsFromProgress(input: {
  sessionId: string;
  questions: Array<{ id: string; question_text: string; tags?: string[] }>;
  answers: Array<{
    question_id: string | null;
    question_text: string;
    answer_text: string;
    skipped: boolean;
    question_index: number;
    is_follow_up?: boolean;
    parent_question_id?: string | null;
    timestamp: string;
    answer_source?: "spoken" | "typed" | "mixed" | "skipped" | "unanswered";
  }>;
}): DurableMockTurn[] {
  return input.answers.map((a) => {
    const q =
      input.questions.find((item) => item.id === a.question_id) ||
      input.questions[a.question_index];
    let answer_source: DurableMockTurn["answer_source"] =
      a.answer_source ?? "spoken";
    if (a.skipped) answer_source = "skipped";
    else if (!a.answer_text.trim()) answer_source = "unanswered";
    return {
      question_id: a.question_id || q?.id || `q-${a.question_index}`,
      sequence: a.question_index + 1,
      parent_question_id: a.parent_question_id ?? null,
      is_follow_up: Boolean(a.is_follow_up),
      question_text: a.question_text || q?.question_text || "",
      competency: q?.tags?.find((t) => !t.includes("_")) ?? null,
      answer_text: a.answer_text,
      answer_source,
      finalized_at: a.timestamp,
    };
  });
}

export function scorecardEligibleTurnCount(turns: DurableMockTurn[]): number {
  return turns.filter(
    (t) =>
      t.answer_source !== "unanswered" &&
      t.answer_source !== "skipped" &&
      t.answer_text.trim().length > 0,
  ).length;
}

/**
 * Align Mock session eligibility with Edge generate-scorecard `hasAnswers`:
 * non-empty, non-skipped answer text counts as evidence (not status==="answered" only).
 * Prevents incomplete/0-0 scorecard UX when real answer evidence exists.
 */
export function countScorableMockAnswers(
  answers: ReadonlyArray<{
    skipped?: boolean;
    answer_text?: string | null;
    status?: string | null;
  }>,
  skippedSentinel = "(skipped)",
): number {
  return answers.filter((a) => {
    if (a.skipped) return false;
    const text = (a.answer_text ?? "").trim();
    if (!text || text === skippedSentinel) return false;
    return true;
  }).length;
}

/** True when the session has scorecard-eligible evidence (answers with content). */
export function mockSessionHasScorecardEvidence(
  answers: ReadonlyArray<{
    skipped?: boolean;
    answer_text?: string | null;
    status?: string | null;
  }>,
): boolean {
  return countScorableMockAnswers(answers) > 0;
}
