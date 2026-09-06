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

/** Bump when IRRELEVANT / relevance heuristics change so Edge can free-repair stale cards. */
export const ANSWER_QUALITY_GATE_VERSION = 2;

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

/** Behavioral-interview theme families — paraphrases should not trip IRRELEVANT. */
const THEME_SYNONYMS: Record<string, readonly string[]> = {
  conflict: [
    "disagreement", "dispute", "friction", "tension", "argument", "clash",
    "misalignment", "pushback", "opposed", "disagreed", "confrontation",
  ],
  team: [
    "colleague", "colleagues", "coworker", "coworkers", "teammate", "teammates",
    "peers", "squad", "group", "crossfunctional",
  ],
  leadership: ["led", "managed", "mentored", "owned", "directed", "guided", "manager"],
  challenge: ["difficult", "obstacle", "problem", "hurdle", "setback", "tough"],
  difficult: ["hard", "challenging", "tough", "complex"],
  weakness: ["improve", "growth", "develop", "struggle", "gap"],
  strength: ["strong", "excel", "skilled", "strengths"],
  failure: ["failed", "mistake", "missed", "wrong", "setback"],
  success: ["succeeded", "achieved", "delivered", "won", "shipped"],
  deadline: ["timeline", "schedule", "urgent", "timebox"],
  pressure: ["stress", "urgent", "stakes"],
  feedback: ["criticism", "review", "input", "suggestion", "critique"],
  disagree: ["disagreement", "opposed", "pushback", "differed"],
  handle: ["handled", "managed", "dealt", "addressed", "resolved"],
  resolve: ["resolved", "fixed", "solved", "mediated", "deescalated"],
  communicate: ["spoke", "talked", "discussed", "explained", "aligned", "conversation"],
  project: ["initiative", "effort", "workstream", "delivery", "feature"],
  customer: ["client", "user", "users", "stakeholder", "stakeholders"],
  example: ["instance", "situation", "story", "time"],
  time: ["situation", "previously", "once", "occasion"],
  situation: ["scenario", "context", "when"],
  tell: ["describe", "share", "walk"],
  describe: ["explain", "share", "outline"],
};

const SYNONYM_INDEX: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const [key, syns] of Object.entries(THEME_SYNONYMS)) {
    const group = new Set<string>([key, ...syns]);
    for (const term of group) {
      let bucket = map.get(term);
      if (!bucket) {
        bucket = new Set<string>();
        map.set(term, bucket);
      }
      for (const g of group) bucket.add(g);
    }
  }
  return map;
})();

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
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

/** True when answer has interview-style substance even if keywords don't match. */
export function hasSubstantialInterviewContent(answer: string): boolean {
  const words = wordCount(answer);
  if (words < 40) return false;
  const text = normalize(answer);
  const firstPerson = (text.match(/\bi\b/g) ?? []).length >= 2;
  if (!firstPerson) return false;
  const starHits = [
    /\b(when i|in my|at my|previously|while working|during|the situation|back at)\b/.test(text),
    /\b(i was (asked|responsible|tasked|assigned)|my (task|goal|responsibility)|i had to|needed to)\b/.test(text),
    /\b(i (led|built|took|decided|spoke|worked|managed|resolved|helped|organized|implemented|created|addressed))\b/.test(text),
    /\b(result|outcome|improved|resolved|increased|decreased|learned|ended up|we (shipped|delivered))\b/.test(text),
  ].filter(Boolean).length;
  return starHits >= 2;
}

/**
 * Lexical + synonym overlap between question tokens and answer text.
 * Used by classify + (mirrored) Edge relevance scoring.
 */
export function relevanceOverlap(
  question: string,
  answer: string,
): { hits: number; qWords: number; ratio: number } {
  const qWords = tokens(question);
  if (qWords.length === 0) return { hits: 0, qWords: 0, ratio: 0 };
  const hay = normalize(answer);
  let hits = 0;
  for (const w of qWords) {
    if (hay.includes(w)) {
      hits += 1;
      continue;
    }
    const related = SYNONYM_INDEX.get(w);
    if (related) {
      let matched = false;
      for (const term of related) {
        if (term === w) continue;
        if (hay.includes(term)) {
          matched = true;
          break;
        }
      }
      if (matched) hits += 1;
    }
  }
  return { hits, qWords: qWords.length, ratio: hits / qWords.length };
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

  const { hits, qWords, ratio } = relevanceOverlap(question, raw);
  const substantial = hasSubstantialInterviewContent(raw);

  // Zero/low keyword overlap alone must not mark a real STAR-style story IRRELEVANT.
  if (qWords >= 2 && hits === 0 && wordCount(raw) >= 8 && !substantial) {
    return "IRRELEVANT";
  }
  if (qWords >= 3 && ratio < 0.08 && wordCount(raw) >= 12 && !substantial) {
    return "IRRELEVANT";
  }

  const answerTokens = tokens(raw);
  for (const prior of priorAnswers) {
    const priorTokens = tokens(prior);
    if (priorTokens.length < 6 || answerTokens.length < 6) continue;
    const sim = jaccard(answerTokens, priorTokens);
    // Copied unrelated response: high similarity but low relevance to current Q
    if (sim >= 0.85 && (qWords === 0 || ratio < 0.2)) {
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
