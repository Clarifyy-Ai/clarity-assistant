/**
 * Duplicate question detection — normalized exact + token Jaccard similarity.
 */

export function normalizeQuestionFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeQuestionFingerprint(text)
      .split(" ")
      .filter((t) => t.length > 2),
  );
}

export function questionSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD = 0.72;

export function isDuplicateQuestion(
  candidate: string,
  previous: string[],
  threshold = DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD,
): { duplicate: boolean; reason: "exact" | "semantic" | null; matched?: string } {
  const norm = normalizeQuestionFingerprint(candidate);
  if (!norm) return { duplicate: false, reason: null };
  for (const prev of previous) {
    const pNorm = normalizeQuestionFingerprint(prev);
    if (!pNorm) continue;
    if (pNorm === norm) {
      return { duplicate: true, reason: "exact", matched: prev };
    }
    if (questionSimilarity(candidate, prev) >= threshold) {
      return { duplicate: true, reason: "semantic", matched: prev };
    }
  }
  return { duplicate: false, reason: null };
}
