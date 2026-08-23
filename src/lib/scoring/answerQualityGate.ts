/**
 * Pre-scoring answer quality classification.
 * Shared by practice workspace (client) — Edge generate-scorecard mirrors this logic.
 */

export type AnswerQualityClass =
  | "EMPTY"
  | "NON_RESPONSIVE"
  | "IRRELEVANT"
  | "REPEATED"
  | "GIBBERISH"
  | "LOW_QUALITY"
  | "VALID";

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "your", "what", "when",
  "how", "why", "are", "was", "were", "have", "has", "had", "you", "can", "could",
  "would", "should", "about", "into", "them", "they", "their", "been", "being",
  "will", "just", "also", "very", "more", "some", "than", "then", "into",
]);

const IDK_EXACT =
  /^(idk|i dont know|i do not know|dont know|do not know|no idea|not sure|n a|na|none|skip|pass|no comment)$/i;

const KEYBOARD_WALK =
  /^(asdf+|qwer+|zxcv+|hjkl+|aaa+|bbb+|ccc+|xyz+|abc+|1234+|qwerty|lorem ipsum)/i;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function wordCount(text: string): number {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

function isGibberish(answer: string): boolean {
  const n = normalize(answer);
  if (!n) return true;
  if (KEYBOARD_WALK.test(n.replace(/\s/g, ""))) return true;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.35) return true;
  }
  const letters = n.replace(/\s/g, "");
  if (letters.length >= 12) {
    const vowels = (letters.match(/[aeiou]/g) ?? []).length;
    if (vowels / letters.length < 0.12) return true;
  }
  if (/(.)\1{5,}/.test(letters)) return true;
  return false;
}

function relevanceHits(question: string, answer: string): { hits: number; qWords: number } {
  const qWords = tokens(question);
  if (qWords.length === 0) return { hits: 0, qWords: 0 };
  const hay = normalize(answer);
  const hits = qWords.filter((w) => hay.includes(w)).length;
  return { hits, qWords: qWords.length };
}

/**
 * Classify a single answer against its question.
 * `priorAnswers` enables cross-question copy detection.
 */
export function classifyAnswerQuality(
  question: string,
  answer: string,
  priorAnswers: string[] = [],
): AnswerQualityClass {
  const raw = String(answer ?? "").trim();
  if (!raw) return "EMPTY";

  const n = normalize(raw);
  if (!n || n.length < 3) return "EMPTY";

  if (IDK_EXACT.test(n) || n.length < 10) return "NON_RESPONSIVE";

  // Soft IDK: answer is mostly a refusal with little else
  if (
    /^(i (dont|do not|can't|cannot|am not) (know|sure|remember)|not sure|no idea)\b/.test(n) &&
    wordCount(raw) < 20
  ) {
    return "NON_RESPONSIVE";
  }

  if (isGibberish(raw)) return "GIBBERISH";

  const { hits, qWords } = relevanceHits(question, raw);
  if (qWords >= 2 && hits === 0 && wordCount(raw) >= 8) {
    return "IRRELEVANT";
  }
  if (qWords >= 3 && hits / qWords < 0.08 && wordCount(raw) >= 12) {
    return "IRRELEVANT";
  }

  const answerTokens = tokens(raw);
  for (const prior of priorAnswers) {
    const priorTokens = tokens(prior);
    if (priorTokens.length < 6 || answerTokens.length < 6) continue;
    const sim = jaccard(answerTokens, priorTokens);
    // Copied unrelated response: high similarity but low relevance to current Q
    if (sim >= 0.85 && (qWords === 0 || hits / Math.max(1, qWords) < 0.2)) {
      return "REPEATED";
    }
    if (sim >= 0.92) return "REPEATED";
  }

  if (wordCount(raw) < 15 && hits === 0) return "LOW_QUALITY";

  return "VALID";
}

export function qualityClassLabel(cls: AnswerQualityClass): string {
  switch (cls) {
    case "EMPTY":
      return "Empty answer";
    case "NON_RESPONSIVE":
      return "Non-responsive answer";
    case "IRRELEVANT":
      return "Irrelevant or non-responsive answer";
    case "REPEATED":
      return "Repeated irrelevant answer";
    case "GIBBERISH":
      return "Gibberish or unintelligible answer";
    case "LOW_QUALITY":
      return "Low-quality answer";
    default:
      return "Answer scored";
  }
}

/** Deterministic score cap by quality class (0–100). */
export function scoreCapForQualityClass(cls: AnswerQualityClass): number {
  switch (cls) {
    case "EMPTY":
    case "NON_RESPONSIVE":
    case "GIBBERISH":
      return 0;
    case "IRRELEVANT":
    case "REPEATED":
      return 5;
    case "LOW_QUALITY":
      return 25;
    default:
      return 100;
  }
}

export function classifySessionAnswers(
  pairs: Array<{ question: string; answer: string }>,
): AnswerQualityClass[] {
  const classes: AnswerQualityClass[] = [];
  const prior: string[] = [];
  for (const pair of pairs) {
    const cls = classifyAnswerQuality(pair.question, pair.answer, prior);
    classes.push(cls);
    if (String(pair.answer ?? "").trim()) prior.push(pair.answer);
  }
  return classes;
}
