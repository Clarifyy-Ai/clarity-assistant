/**
 * Similarity + MCQ validation for create-exam-paper (mirrors src/lib/gov-exam).
 */

import { DEDUP_POLICY } from "./algorithmCatalog.ts";

const LATEX_OR_GREEK: Array<[RegExp, string]> = [
  [/\\alpha|α/gi, " alpha "],
  [/\\beta|β/gi, " beta "],
  [/\\gamma|γ/gi, " gamma "],
  [/\\theta|θ/gi, " theta "],
  [/\\pi|π/gi, " pi "],
  [/\\omega|ω/gi, " omega "],
  [/\\sigma|σ/gi, " sigma "],
  [/\\lambda|λ/gi, " lambda "],
  [/\\mu|μ/gi, " mu "],
  [/\\delta|\\Delta|δ|Δ/gi, " delta "],
];

function expandMathTokens(text: string): string {
  let t = text;
  for (const [re, rep] of LATEX_OR_GREEK) t = t.replace(re, rep);
  return t.replace(/\\[a-zA-Z]+/g, " ");
}

export function normalizeQuestionText(text: string): string {
  return expandMathTokens(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalizeQuestionText(text);
  return n ? n.split(" ").filter(Boolean) : [];
}

export function questionFingerprint(text: string, options: string[] = []): string {
  const base = normalizeQuestionText(text);
  const opts = options.map(normalizeQuestionText).sort().join("|");
  return `${base}::${opts}`;
}

export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export function charNgrams(text: string, n = 3): Set<string> {
  const s = normalizeQuestionText(text).replace(/\s+/g, "");
  const out = new Set<string>();
  if (s.length < n) {
    if (s) out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}

export function ngramJaccard(a: string, b: string, n = 3): number {
  const aa = charNgrams(a, n);
  const bb = charNgrams(b, n);
  if (aa.size === 0 && bb.size === 0) return 1;
  if (aa.size === 0 || bb.size === 0) return 0;
  let inter = 0;
  for (const g of aa) if (bb.has(g)) inter += 1;
  const union = aa.size + bb.size - inter;
  return union > 0 ? inter / union : 0;
}

export type SimilarityBreakdown = {
  exact: boolean;
  containment: number;
  tokenJaccard: number;
  ngramJaccard: number;
  score: number;
};

export function similarityBreakdown(a: string, b: string): SimilarityBreakdown {
  const na = normalizeQuestionText(a);
  const nb = normalizeQuestionText(b);
  if (!na || !nb) {
    return { exact: false, containment: 0, tokenJaccard: 0, ngramJaccard: 0, score: 0 };
  }
  const exact = na === nb;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  const containment =
    longer.includes(shorter) && shorter.length > 0
      ? shorter.length / longer.length
      : 0;
  const tj = tokenJaccard(na, nb);
  const nj = ngramJaccard(na, nb, 3);
  const score = Math.max(exact ? 1 : 0, containment, tj, nj);
  return { exact, containment, tokenJaccard: tj, ngramJaccard: nj, score };
}

export function isNearDuplicate(
  a: string,
  b: string,
  threshold = DEDUP_POLICY.stem_only_conflict,
): boolean {
  const d = similarityBreakdown(a, b);
  if (d.exact) return true;
  const composite =
    d.tokenJaccard * DEDUP_POLICY.composite_weights.token +
    d.ngramJaccard * DEDUP_POLICY.composite_weights.ngram;
  const template = (value: string) =>
    normalizeQuestionText(value)
      .replace(/\b\d+(?:\.\d+)?\b/g, "<num>")
      .replace(/\b[xyzabc]\b/g, "<var>");
  const templateA = template(a);
  const templateB = template(b);
  const templateSimilarity = tokenJaccard(templateA, templateB);
  return (
    composite >= Math.max(threshold, DEDUP_POLICY.near_duplicate_composite) ||
    d.score >= DEDUP_POLICY.stem_max_near ||
    templateA === templateB ||
    templateSimilarity >= DEDUP_POLICY.template_clone_similarity
  );
}

export function conflictsWithSelected(
  candidate: string,
  selectedTexts: string[],
  threshold = DEDUP_POLICY.stem_only_conflict,
): boolean {
  for (const prev of selectedTexts) {
    if (isNearDuplicate(candidate, prev, threshold)) return true;
  }
  return false;
}

export function findNearDuplicatesInSet(
  texts: string[],
  threshold = DEDUP_POLICY.stem_only_conflict,
): Array<{ i: number; j: number; score: number }> {
  const pairs: Array<{ i: number; j: number; score: number }> = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const d = similarityBreakdown(texts[i], texts[j]);
      if (d.exact || d.score >= threshold) {
        pairs.push({ i, j, score: d.score });
      }
    }
  }
  return pairs;
}

export function validateSingleCorrectMcq(q: {
  question_text: string;
  options: string[];
  correct_index: number;
}): { ok: true } | { ok: false; code: string; message: string } {
  const text = q.question_text?.trim() ?? "";
  if (text.length < 8) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Question text too short." };
  }
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Government exam MCQs require exactly 4 options." };
  }
  if (q.options.some((o) => !String(o ?? "").trim())) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Empty option." };
  }
  const normalized = q.options.map((o) => o.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return { ok: false, code: "QUESTION_VALIDATION_FAILED", message: "Duplicate options." };
  }
  if (
    !Number.isInteger(q.correct_index) ||
    q.correct_index < 0 ||
    q.correct_index >= q.options.length
  ) {
    return {
      ok: false,
      code: "ANSWER_VERIFICATION_FAILED",
      message: "correct_index out of range.",
    };
  }
  return { ok: true };
}

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

/** Extract display text from a bank option (string or `{label,text}` object). */
export function optionText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const t = rec.text ?? rec.value;
    if (typeof t === "string" && t.trim()) return t.trim();
    if (typeof rec.label === "string" && rec.label.trim().length > 1) {
      return rec.label.trim();
    }
  }
  return "";
}

/**
 * Normalize questions.options JSON into 2–4 unique option strings.
 * Bank rows store `[{label:'A', text:'...'}]`; String(object) is "[object Object]"
 * and falsely fails quality as duplicate options.
 */
export function normalizeMcqOptions(raw: unknown, max = 4): string[] {
  if (!Array.isArray(raw)) return [];
  const texts = raw.map(optionText).filter(Boolean).slice(0, max);
  return texts;
}

export function optionsForStorage(
  texts: string[],
): Array<{ label: string; text: string }> {
  return texts.slice(0, 4).map((text, i) => ({
    label: LETTERS[i] ?? String(i + 1),
    text,
  }));
}

/** Resolve bank correct_answer letter or numeric string to 0-based index. */
export function resolveCorrectIndex(
  correctAnswer: unknown,
  optionCount: number,
): number | null {
  if (typeof correctAnswer === "number" && Number.isInteger(correctAnswer)) {
    return correctAnswer >= 0 && correctAnswer < optionCount ? correctAnswer : null;
  }
  const raw = String(correctAnswer ?? "").trim().toUpperCase();
  const letterIdx = LETTERS.indexOf(raw as (typeof LETTERS)[number]);
  if (letterIdx >= 0 && letterIdx < optionCount) return letterIdx;
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 0 && asNum < optionCount) return asNum;
  // 1-based numeric
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= optionCount) return asNum - 1;
  return null;
}
