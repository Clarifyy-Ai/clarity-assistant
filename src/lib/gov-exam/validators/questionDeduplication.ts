/**
 * Question Deduplication, Multi-Signal Similarity, and Current Affairs Lifecycle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  charNgrams,
  ngramJaccard,
  normalizeQuestionText,
  tokenJaccard,
} from "./similarity";

export type DuplicateDecision =
  | "exact_duplicate"
  | "near_duplicate"
  | "template_clone"
  | "unique"
  | "flagged_for_review"
  | "rejected"
  | "approved";

export type ReviewerOverride = "approved" | "rejected" | "merged" | "distinct";

export interface SimilarityEvaluation {
  decision: DuplicateDecision;
  similarityScore: number;
  tokenJaccard: number;
  ngramJaccard: number;
  templateSimilarity: number;
  fingerprintMatch: boolean;
  matchingQuestionId?: string | null;
}

export interface CurrentAffairsMetadata {
  applicableDate?: string | null;
  sourceDate?: string | null;
  cutoffDate?: string | null;
  primarySource?: string | null;
  expiryDate?: string | null;
  isStale?: boolean;
}

/**
 * Normalizes question stem into a template fingerprint by masking numbers and single variables.
 */
export function computeTemplateFingerprint(text: string): string {
  const norm = normalizeQuestionText(text);
  return norm
    .replace(/\b\d+(?:\.\d+)?\b/g, "<NUM>")
    .replace(/\b[xyzabc]\b/g, "<VAR>");
}

/**
 * Computes a stable option-set fingerprint from an array of option strings.
 */
export function computeOptionSetFingerprint(options: string[]): string {
  const normOpts = options
    .map(normalizeQuestionText)
    .filter(Boolean)
    .sort();
  return normOpts.join("|");
}

/**
 * Evaluates multi-signal similarity between two questions.
 */
export function evaluateQuestionSimilarity(
  q1Text: string,
  q1Options: string[],
  q2Text: string,
  q2Options: string[],
  q2Id?: string | null,
): SimilarityEvaluation {
  const n1 = normalizeQuestionText(q1Text);
  const n2 = normalizeQuestionText(q2Text);

  const optFingerprint1 = computeOptionSetFingerprint(q1Options);
  const optFingerprint2 = computeOptionSetFingerprint(q2Options);

  // Exact Match
  if (n1 === n2 && optFingerprint1 === optFingerprint2) {
    return {
      decision: "exact_duplicate",
      similarityScore: 1.0,
      tokenJaccard: 1.0,
      ngramJaccard: 1.0,
      templateSimilarity: 1.0,
      fingerprintMatch: true,
      matchingQuestionId: q2Id,
    };
  }

  // Pre-normalize number/unit junctions (e.g. 150m -> 150 m)
  const cleanQ1 = q1Text.replace(/(\d+)([a-zA-Z]+)/g, "$1 $2");
  const cleanQ2 = q2Text.replace(/(\d+)([a-zA-Z]+)/g, "$1 $2");

  const tokSim = tokenJaccard(cleanQ1, cleanQ2);
  const ngSim = ngramJaccard(cleanQ1, cleanQ2, 3);

  // Option overlap
  const set1 = new Set(q1Options.map(normalizeQuestionText).filter(Boolean));
  const set2 = new Set(q2Options.map(normalizeQuestionText).filter(Boolean));
  let inter = 0;
  for (const o of set1) if (set2.has(o)) inter++;
  const union = set1.size + set2.size - inter;
  const optOverlap = union > 0 ? inter / union : 0;

  const stemMaxSim = Math.max(tokSim, ngSim);
  const compositeScore = tokSim * 0.4 + ngSim * 0.4 + optOverlap * 0.2;

  // Template Clone Check (same underlying template structure with changed numbers/variables)
  const tpl1 = computeTemplateFingerprint(cleanQ1);
  const tpl2 = computeTemplateFingerprint(cleanQ2);
  const tplSim = tokenJaccard(tpl1, tpl2);
  const isTemplateClone = (tpl1 === tpl2 || tplSim >= 0.9) && n1 !== n2;

  let decision: DuplicateDecision = "unique";
  if (isTemplateClone) {
    decision = "template_clone";
  } else if (compositeScore >= 0.65 || (optOverlap >= 0.8 && stemMaxSim >= 0.5) || stemMaxSim >= 0.8) {
    decision = "near_duplicate";
  } else if (compositeScore >= 0.45 || (optOverlap > 0.4 && stemMaxSim >= 0.35)) {
    decision = "flagged_for_review";
  }

  return {
    decision,
    similarityScore: Number(compositeScore.toFixed(4)),
    tokenJaccard: Number(tokSim.toFixed(4)),
    ngramJaccard: Number(ngSim.toFixed(4)),
    templateSimilarity: Number(tplSim.toFixed(4)),
    fingerprintMatch: false,
    matchingQuestionId: q2Id,
  };
}

/**
 * Evaluates current affairs temporal staleness.
 */
export function evaluateCurrentAffairsStaleness(
  metadata: CurrentAffairsMetadata,
  referenceDate: Date = new Date(),
): { isStale: boolean; reason?: string } {
  const refDateStr = referenceDate.toISOString().slice(0, 10);

  if (metadata.expiryDate && metadata.expiryDate < refDateStr) {
    return {
      isStale: true,
      reason: `Current affairs question expired on ${metadata.expiryDate} (reference date: ${refDateStr}).`,
    };
  }

  if (metadata.cutoffDate) {
    const cutoffTime = new Date(metadata.cutoffDate).getTime();
    const diffDays = (referenceDate.getTime() - cutoffTime) / (1000 * 60 * 60 * 24);
    if (diffDays > 365) {
      return {
        isStale: true,
        reason: `Current affairs question exceeded 1-year cutoff window (${Math.floor(diffDays)} days old).`,
      };
    }
  }

  return { isStale: false };
}

/**
 * Persists a similarity match decision in question_similarity_matches.
 */
export async function persistSimilarityMatch(
  supabase: SupabaseClient,
  params: {
    questionId: string;
    matchingQuestionId: string;
    similarityScore: number;
    tokenJaccard?: number;
    ngramJaccard?: number;
    fingerprintMatch?: boolean;
    decision: DuplicateDecision;
    reviewerOverride?: ReviewerOverride | null;
    reviewerNotes?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from("question_similarity_matches")
      .upsert(
        {
          question_id: params.questionId,
          matching_question_id: params.matchingQuestionId,
          similarity_score: params.similarityScore,
          token_jaccard: params.tokenJaccard ?? null,
          ngram_jaccard: params.ngramJaccard ?? null,
          fingerprint_match: params.fingerprintMatch ?? false,
          decision: params.decision,
          reviewer_override: params.reviewerOverride || null,
          reviewer_notes: params.reviewerNotes || null,
          metadata: params.metadata || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "question_id,matching_question_id" },
      );

    if (error) return { success: false, error: new Error(error.message) };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
