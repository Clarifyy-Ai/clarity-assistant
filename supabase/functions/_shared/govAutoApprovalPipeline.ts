/**
 * Shared auto-approval orchestration for ingest / assembly pipelines.
 */

import {
  buildIdempotencyKey,
  evaluateAutoApproval,
  loadAutoApprovalRule,
  type AutoApprovalEvaluation,
  type AutoApprovalRuleConfig,
  type PaperValidationInput,
  type QuestionValidationInput,
} from "./govAutoApproval.ts";

type RpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function applyAutoApprovalEvaluation(
  db: RpcClient,
  entityType: "question" | "paper",
  entityId: string,
  evaluation: AutoApprovalEvaluation,
  opts: {
    rule: AutoApprovalRuleConfig;
    processingJobId?: string | null;
    paperId?: string | null;
    provenance?: Record<string, unknown> | null;
  },
): Promise<{ outcome: string; error?: string }> {
  const idempotencyKey = buildIdempotencyKey(
    entityType,
    entityId,
    opts.processingJobId ?? null,
    evaluation.ruleVersion ?? opts.rule.ruleVersion,
  );

  const { error } = await db.rpc("apply_auto_approval_event", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_outcome: evaluation.outcome,
    p_approval_mode: evaluation.approvalMode,
    p_rule_version: evaluation.ruleVersion,
    p_rule_evaluation: {
      flags: evaluation.flags,
      ruleResults: evaluation.ruleResults,
    },
    p_source_type: evaluation.sourceType,
    p_quality_score: evaluation.qualityScore,
    p_duplicate_result: evaluation.duplicateResult,
    p_provenance: opts.provenance ?? null,
    p_processing_job_id: opts.processingJobId ?? null,
    p_paper_id: opts.paperId ?? null,
    p_previous_status: evaluation.previousStatus,
    p_new_status: evaluation.newStatus,
    p_publish_status: evaluation.publishStatus,
    p_idempotency_key: idempotencyKey,
    p_auto_publish: evaluation.autoPublish,
  });

  if (error) {
    console.error(`[auto-approval] apply failed for ${entityType}/${entityId}:`, error.message);
    return { outcome: "AUTO_APPROVAL_FAILED", error: error.message };
  }

  return { outcome: evaluation.outcome };
}

export async function evaluateAndApplyQuestionAutoApproval(
  db: RpcClient & Parameters<typeof loadAutoApprovalRule>[0],
  questionId: string,
  validation: QuestionValidationInput,
  opts?: {
    rule?: AutoApprovalRuleConfig;
    processingJobId?: string | null;
    provenance?: Record<string, unknown> | null;
  },
): Promise<{ outcome: string; error?: string }> {
  const rule = opts?.rule ?? await loadAutoApprovalRule(db, "question");
  const evaluation = evaluateAutoApproval({ ...validation, entityType: "question", questionId }, rule);
  return applyAutoApprovalEvaluation(db, "question", questionId, evaluation, {
    rule,
    processingJobId: opts?.processingJobId,
    provenance: opts?.provenance,
  });
}

export async function evaluateAndApplyPaperAutoApproval(
  db: RpcClient & Parameters<typeof loadAutoApprovalRule>[0],
  paperId: string,
  validation: PaperValidationInput,
  opts?: {
    rule?: AutoApprovalRuleConfig;
    processingJobId?: string | null;
    provenance?: Record<string, unknown> | null;
  },
): Promise<{ outcome: string; error?: string }> {
  const rule = opts?.rule ?? await loadAutoApprovalRule(db, "paper");
  const evaluation = evaluateAutoApproval({ ...validation, entityType: "paper", paperId }, rule);
  return applyAutoApprovalEvaluation(db, "paper", paperId, evaluation, {
    rule,
    processingJobId: opts?.processingJobId,
    provenance: opts?.provenance,
  });
}

export async function evaluateAndApplyQuestionBatch(
  db: RpcClient & Parameters<typeof loadAutoApprovalRule>[0],
  items: Array<{
    id: string;
    validation: QuestionValidationInput;
    provenance?: Record<string, unknown> | null;
    processingJobId?: string | null;
  }>,
): Promise<Array<{ id: string; outcome: string }>> {
  const rule = await loadAutoApprovalRule(db, "question");
  const results: Array<{ id: string; outcome: string }> = [];

  for (const item of items) {
    try {
      const applied = await evaluateAndApplyQuestionAutoApproval(db, item.id, item.validation, {
        rule,
        processingJobId: item.processingJobId,
        provenance: item.provenance,
      });
      results.push({ id: item.id, outcome: applied.outcome });
    } catch (err) {
      console.error("[auto-approval] batch item failed:", item.id, err);
      results.push({ id: item.id, outcome: "AUTO_APPROVAL_FAILED" });
    }
  }

  return results;
}
