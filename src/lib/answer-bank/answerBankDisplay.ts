import type { Tables } from "@/integrations/supabase";

type AnswerBankEntry = Pick<Tables<"answer_bank">, "question_text" | "tags" | "source">;

const REPHRASER_TITLE_RE = /^Rephrased answer \((Formal|Confident|Concise)\)$/i;
const REPHRASER_STYLES = new Set(["formal", "confident", "concise"]);

export function isRephraserEntry(entry: AnswerBankEntry): boolean {
  const tags = entry.tags ?? [];
  if (tags.includes("rephraser")) return true;
  return REPHRASER_TITLE_RE.test(entry.question_text ?? "");
}

export function rephraserStyleLabel(entry: AnswerBankEntry): string | null {
  const tag = (entry.tags ?? []).find((t) => REPHRASER_STYLES.has(t.toLowerCase()));
  if (tag) return tag.charAt(0).toUpperCase() + tag.slice(1);

  const match = entry.question_text?.match(REPHRASER_TITLE_RE);
  return match?.[1] ?? null;
}

/** Page title for detail view — keeps rephraser style label when original text is stored separately. */
export function answerBankDetailTitle(entry: AnswerBankEntry): string {
  const style = rephraserStyleLabel(entry);
  const question = entry.question_text?.trim() ?? "";

  if (isRephraserEntry(entry) && style && !REPHRASER_TITLE_RE.test(question)) {
    return `Rephrased answer (${style})`;
  }

  return question || "Saved answer";
}

/** Whether the stored question_text is user content worth showing in the body. */
export function shouldShowQuestionSection(entry: AnswerBankEntry): boolean {
  const question = entry.question_text?.trim();
  if (!question) return false;
  if (REPHRASER_TITLE_RE.test(question)) return false;
  return true;
}

export function questionSectionLabel(entry: AnswerBankEntry): string {
  return isRephraserEntry(entry) ? "Original answer" : "Question";
}

/** Legacy rephraser rows saved before original text was persisted. */
export function isLegacyRephraserEntry(entry: AnswerBankEntry): boolean {
  return REPHRASER_TITLE_RE.test(entry.question_text?.trim() ?? "");
}

export function buildRephraserAnswerBankPayload(
  original: string,
  style: "formal" | "confident" | "concise",
  answerText: string,
): {
  question_text: string;
  answer_text: string;
  source: "prep_lab";
  tags: string[];
  category: string;
} {
  return {
    question_text: original.trim(),
    answer_text: answerText,
    source: "prep_lab",
    tags: ["rephraser", style],
    category: "General",
  };
}
