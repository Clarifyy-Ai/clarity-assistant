/**
 * Question similarity: fingerprint + n-gram + Jaccard (primary, deterministic).
 *
 * Embedding-ready helpers (`cosineSimilarity`, `combineScores`) are optional and
 * offline-only until a vector store exists. Do NOT call external embedding APIs
 * from this module without explicit keys and an approved offline/batch path —
 * production near-dup detection must keep working with n-gram/Jaccard alone.
 */

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalizeQuestionText(text);
  return n ? n.split(" ").filter(Boolean) : [];
}

/** Stable fingerprint of stem + sorted options. */
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

/** Character n-grams over normalized text (default n=3). */
export function charNgrams(text: string, n = 3): Set<string> {
  const s = normalizeQuestionText(text).replace(/\s+/g, "");
  const out = new Set<string>();
  if (s.length < n) {
    if (s) out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - n; i++) {
    out.add(s.slice(i, i + n));
  }
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
  /** Max of the continuous signals (0–1). */
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

/**
 * Near-duplicate when any strong signal fires.
 * Default threshold 0.88 — slightly stricter than legacy 0.92 containment-only path
 * because n-gram Jaccard catches paraphrases that token Jaccard misses.
 */
export function isNearDuplicate(
  a: string,
  b: string,
  threshold = 0.88,
): boolean {
  const d = similarityBreakdown(a, b);
  if (d.exact) return true;
  return d.score >= threshold;
}

export type NearDupPair = {
  i: number;
  j: number;
  score: number;
  aPreview: string;
  bPreview: string;
};

/** Pairwise near-dupes within a paper (O(n²); fine for ≤200 Qs). */
export function findNearDuplicatesInSet(
  texts: string[],
  threshold = 0.88,
): NearDupPair[] {
  const pairs: NearDupPair[] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const d = similarityBreakdown(texts[i], texts[j]);
      if (d.exact || d.score >= threshold) {
        pairs.push({
          i,
          j,
          score: d.score,
          aPreview: texts[i].slice(0, 80),
          bPreview: texts[j].slice(0, 80),
        });
      }
    }
  }
  return pairs;
}

/** Reject candidate if near-dup of any already accepted. */
export function conflictsWithSelected(
  candidate: string,
  selectedTexts: string[],
  threshold = 0.88,
): boolean {
  for (const prev of selectedTexts) {
    if (isNearDuplicate(candidate, prev, threshold)) return true;
  }
  return false;
}

// ── Embedding-ready (optional / offline) ─────────────────────────────────────

/**
 * Cosine similarity of two equal-length vectors. Returns 0 for empty/mismatched
 * lengths or zero norms. Callers supply embeddings; this module never fetches them.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type CombinedSimilarityScores = {
  /** Primary deterministic score from n-gram / Jaccard / containment (0–1). */
  lexical: number;
  /** Optional cosine of precomputed embeddings (0–1 after clamp); omit when N/A. */
  embedding?: number;
  /** Weighted blend; embedding ignored when undefined. */
  combined: number;
};

/**
 * Blend lexical (primary) with optional embedding cosine.
 * Default weights keep lexical dominant so offline n-gram remains the gate.
 */
export function combineScores(
  lexical: number,
  embedding?: number,
  weights: { lexical?: number; embedding?: number } = {},
): CombinedSimilarityScores {
  const wLex = weights.lexical ?? (embedding === undefined ? 1 : 0.65);
  const wEmb = weights.embedding ?? (embedding === undefined ? 0 : 0.35);
  const lex = clamp01(lexical);
  if (embedding === undefined) {
    return { lexical: lex, combined: lex };
  }
  const emb = clamp01(embedding);
  const denom = wLex + wEmb;
  const combined = denom > 0 ? (wLex * lex + wEmb * emb) / denom : lex;
  return { lexical: lex, embedding: emb, combined: clamp01(combined) };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Optional near-dup check that can incorporate precomputed embeddings.
 * Without embeddings, identical to {@link isNearDuplicate}.
 */
export function isNearDuplicateWithOptionalEmbedding(
  a: string,
  b: string,
  opts?: {
    threshold?: number;
    embeddingA?: number[];
    embeddingB?: number[];
    weights?: { lexical?: number; embedding?: number };
  },
): boolean {
  const threshold = opts?.threshold ?? 0.88;
  const lexical = similarityBreakdown(a, b).score;
  let embedding: number | undefined;
  if (opts?.embeddingA && opts?.embeddingB) {
    embedding = cosineSimilarity(opts.embeddingA, opts.embeddingB);
  }
  const { combined } = combineScores(lexical, embedding, opts?.weights);
  return combined >= threshold;
}
