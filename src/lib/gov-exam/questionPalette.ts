/**
 * Canonical question status model for the gov-exam runner palette.
 * Presentation (color, label) is derived — never stored as a second source of truth.
 */

export const QUESTION_PALETTE_STATES = [
  "unattempted",
  "visited",
  "answered",
  "marked",
  "answered-marked",
] as const;

export type QuestionPaletteState = (typeof QUESTION_PALETTE_STATES)[number];

export type QuestionPaletteResponse = {
  answer: string;
  state: QuestionPaletteState;
};

export const QUESTION_PALETTE_COLORS: Record<QuestionPaletteState, string> = {
  unattempted: "bg-card text-foreground border-border hover:bg-muted",
  visited:
    "bg-yellow-500/10 text-yellow-600 border-yellow-500/40 dark:text-yellow-400",
  answered:
    "bg-green-500/10 text-green-600 border-green-500/40 dark:text-green-400",
  marked:
    "bg-purple-500/10 text-purple-600 border-purple-500/40 dark:text-purple-400",
  "answered-marked":
    "bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400",
};

export const QUESTION_PALETTE_STATUS: Record<
  QuestionPaletteState,
  { label: string; short: string }
> = {
  unattempted: { label: "Not visited", short: "NV" },
  visited: { label: "Visited, not answered", short: "V" },
  answered: { label: "Answered", short: "A" },
  marked: { label: "Marked for review", short: "M" },
  "answered-marked": { label: "Answered and marked for review", short: "AM" },
};

export function deriveQuestionPaletteState(input: {
  answer?: string | null;
  isAttempted?: boolean | null;
  isMarkedReview?: boolean | null;
  visited?: boolean;
}): QuestionPaletteState {
  const answer = String(input.answer ?? "").trim();
  const isAnswered = Boolean(answer);
  const isMarked = Boolean(input.isMarkedReview);
  if (isAnswered && isMarked) return "answered-marked";
  if (isAnswered) return "answered";
  if (isMarked) return "marked";
  if (input.isAttempted || input.visited) return "visited";
  return "unattempted";
}

export function deriveResponseFromRow(row: {
  user_answer?: string | null;
  is_attempted?: boolean | null;
  is_marked_review?: boolean | null;
}): QuestionPaletteResponse {
  const answer = row.user_answer ?? "";
  return {
    answer,
    state: deriveQuestionPaletteState({
      answer,
      isAttempted: row.is_attempted,
      isMarkedReview: row.is_marked_review,
    }),
  };
}

export function palettePresentation(state: QuestionPaletteState): {
  className: string;
  label: string;
  short: string;
} {
  const status = QUESTION_PALETTE_STATUS[state];
  return {
    className: QUESTION_PALETTE_COLORS[state],
    label: status.label,
    short: status.short,
  };
}
