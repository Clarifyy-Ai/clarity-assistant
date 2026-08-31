/**
 * Client-side mirror of the Edge auto-approval rule engine for tests and admin UI.
 * Authoritative evaluation runs on Edge; this mirrors logic for offline validation.
 */

export {
  AUTO_APPROVAL_OUTCOMES,
  APPROVAL_MODES,
  NEVER_OFFICIAL_SOURCE_TYPES,
  ALWAYS_MANUAL_REVIEW_FLAGS,
  DEFAULT_QUESTION_RULE,
  DEFAULT_PAPER_RULE,
  parseRuleRow,
  evaluateAutoApproval,
  buildIdempotencyKey,
} from "../../../supabase/functions/_shared/govAutoApproval.ts";

export type {
  AutoApprovalOutcome,
  ApprovalMode,
  AutoApprovalRuleConfig,
  QuestionValidationInput,
  PaperValidationInput,
  AutoApprovalEvaluation,
} from "../../../supabase/functions/_shared/govAutoApproval.ts";
