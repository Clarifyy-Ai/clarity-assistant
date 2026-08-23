/**
 * Client projection of shared/algorithm-catalog.json.
 * Preview / UX only — Edge + Python validators are authoritative.
 */
import catalog from "./algorithmCatalog.json";

export const ALGORITHM_CATALOG = catalog;

export const QUALITY_ALGORITHM_VERSION = catalog.quality_algorithm_version;
export const DEDUP_ALGORITHM_VERSION = catalog.dedup_algorithm_version;
export const MASTERY_ALGORITHM_VERSION_CATALOG = catalog.mastery_algorithm_version;
export const SCORING_ALGORITHM_VERSION = catalog.scoring_algorithm_version;
export const PAPER_BLUEPRINT_VERSION = catalog.paper_blueprint_version;
export const CREDIT_CATALOG_VERSION = catalog.credit_catalog_version;

export const MIN_BANK_QUESTION_QUALITY = catalog.quality.min_bank_question_quality;
export const QUALITY_WEIGHTS = catalog.quality.weights;
export const DEDUP_POLICY = catalog.dedup;
