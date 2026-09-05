/**
 * Authoritative algorithm catalog — keep in lockstep with
 * shared/algorithm-catalog.json (copied values; Deno cannot import repo-root JSON).
 */
export const CREDIT_CATALOG_VERSION = "credit_catalog_v3";
export const QUALITY_ALGORITHM_VERSION = "gov_question_quality_v2";
export const DEDUP_ALGORITHM_VERSION = "gov_question_dedup_v2";
export const MASTERY_ALGORITHM_VERSION = "mastery_v1";
export const SCORING_ALGORITHM_VERSION = "scorecard_v2";
export const PAPER_BLUEPRINT_VERSION = "gov_paper_v1";

export const MIN_BANK_QUESTION_QUALITY = 40;

export const QUALITY_WEIGHTS = {
  mcq_structure: 0.25,
  answer_uniqueness: 0.2,
  similarity: 0.2,
  stem_length: 0.1,
  explanation_present: 0.05,
  source_confidence: 0.1,
  fingerprint: 0.05,
  quant_template: 0.1,
  reasoning_syllogism: 0.1,
  reasoning_seating: 0.1,
} as const;

export const QUALITY_STEM = {
  too_short: 8,
  short: 20,
  too_long: 1200,
  score_too_short: 0,
  score_short: 0.5,
  score_ok: 1,
  score_too_long: 0.6,
} as const;

export const QUALITY_EXPLANATION_MISSING = 0.4;
export const QUALITY_SOURCE_DEFAULT = 0.7;
export const QUALITY_SOURCE_PASS = 0.4;
export const QUALITY_SIM_SOFT_FLOOR = 0.5;
export const QUALITY_SIM_SOFT_PENALTY = 0.5;

export const DEDUP_POLICY = {
  embeddings_enabled: false,
  composite_weights: { token: 0.4, ngram: 0.4, option_overlap: 0.2 },
  near_duplicate_composite: 0.65,
  review_composite: 0.45,
  template_clone_similarity: 0.9,
  option_overlap_near: 0.8,
  stem_max_near: 0.8,
  stem_max_near_with_options: 0.5,
  review_option_overlap: 0.4,
  review_stem_max: 0.35,
  stem_only_conflict: 0.8,
} as const;

export const MAX_REFUND_SAFETY_CAP = 100;
