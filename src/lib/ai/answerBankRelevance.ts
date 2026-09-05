/**
 * Question-scored Answer Bank selection for AI context injection.
 */

export type AnswerBankEntryForContext = {
  id: string;
  question_text: string;
  answer_text?: string | null;
  star_situation?: string | null;
  star_task?: string | null;
  star_action?: string | null;
  star_result?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  category?: string | null;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "is", "are", "was", "were", "be", "been", "being", "have", "has",
  "had", "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "you", "your", "me", "my", "tell", "about", "describe", "give", "example", "time",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function starText(entry: AnswerBankEntryForContext): string {
  const parts = [
    entry.star_situation,
    entry.star_task,
    entry.star_action,
    entry.star_result,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" → ");
  return entry.summary ?? entry.answer_text?.slice(0, 240) ?? "";
}

/**
 * Score relevance of an Answer Bank entry to the current question (0–1).
 */
export function scoreAnswerBankRelevance(
  entry: AnswerBankEntryForContext,
  questionText: string,
): number {
  const qTokens = tokenize(questionText);
  if (qTokens.size === 0) return 0;

  const corpus = [
    entry.question_text,
    starText(entry),
    ...(entry.tags ?? []),
    entry.category ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const entryTokens = tokenize(corpus);
  if (entryTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of qTokens) {
    if (entryTokens.has(t)) overlap += 1;
  }

  const jaccard = overlap / (qTokens.size + entryTokens.size - overlap);
  const questionMatch = tokenize(entry.question_text);
  let qOverlap = 0;
  for (const t of qTokens) {
    if (questionMatch.has(t)) qOverlap += 1;
  }
  const questionBoost = qOverlap / Math.max(qTokens.size, 1);

  return Math.min(1, jaccard * 0.6 + questionBoost * 0.4);
}

export function selectRelevantAnswerBankEntries(
  entries: AnswerBankEntryForContext[],
  questionText: string,
  opts?: { max?: number; minScore?: number; preferIds?: string[] },
): AnswerBankEntryForContext[] {
  const max = opts?.max ?? 5;
  const minScore = opts?.minScore ?? 0.05;
  const preferIds = new Set(opts?.preferIds ?? []);

  const scored = entries
    .map((entry) => ({
      entry,
      score:
        scoreAnswerBankRelevance(entry, questionText) +
        (preferIds.has(entry.id) ? 0.5 : 0),
    }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const preferred = entries.filter((e) => preferIds.has(e.id));
    if (preferred.length > 0) return preferred.slice(0, max);
    return entries.slice(0, max);
  }

  return scored.slice(0, max).map(({ entry }) => entry);
}

export function formatAnswerBankBlock(entries: AnswerBankEntryForContext[]): string {
  if (!entries.length) return "";
  const lines = entries.map((entry) => {
    const star = starText(entry);
    return `Q: ${entry.question_text}\nSTAR: ${star}`;
  });
  return `\n\nRelevant saved STAR stories:\n${lines.join("\n\n")}`;
}

export async function loadAnswerBankSnippetsByIds(
  ids: string[],
  loadById: (id: string) => Promise<AnswerBankEntryForContext | null>,
): Promise<string[]> {
  const snippets: string[] = [];
  for (const id of ids.slice(0, 8)) {
    try {
      const entry = await loadById(id);
      if (!entry) continue;
      const star = starText(entry);
      snippets.push(`Q: ${entry.question_text}\nSTAR: ${star}`.slice(0, 500));
    } catch {
      // skip
    }
  }
  return snippets;
}
