/**
 * evaluate-auto-approval — Edge orchestration for deterministic auto-approval.
 * Auth: service role (ingest pipelines) or admin (manual re-evaluation).
 * Python validates/scores; this function applies policy + persists audit.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, enforceAdmin } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  evaluateAutoApproval,
  parseRuleRow,
  buildIdempotencyKey,
  type QuestionValidationInput,
  type PaperValidationInput,
  type AutoApprovalEvaluation,
} from "../_shared/govAutoApproval.ts";

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

async function loadActiveRule(
  db: ReturnType<typeof createServiceClient>,
  entityType: "question" | "paper",
) {
  const { data } = await db
    .from("gov_auto_approval_rules")
    .select("*")
    .eq("entity_type", entityType)
    .eq("enabled", true)
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) return parseRuleRow(data as Record<string, unknown>);

  const { data: latest } = await db
    .from("gov_auto_approval_rules")
    .select("*")
    .eq("entity_type", entityType)
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return latest
    ? parseRuleRow(latest as Record<string, unknown>)
    : undefined;
}

async function persistEvaluation(
  db: ReturnType<typeof createServiceClient>,
  entityType: "question" | "paper",
  entityId: string,
  evaluation: AutoApprovalEvaluation,
  processingJobId: string | null,
  paperId: string | null,
  provenance: Record<string, unknown> | null,
  persist: boolean,
) {
  if (!persist) return { event_id: null, idempotent: false };

  const idempotencyKey = buildIdempotencyKey(
    entityType,
    entityId,
    processingJobId,
    evaluation.ruleVersion ?? 1,
  );

  const { data, error } = await db.rpc("apply_auto_approval_event", {
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
    p_provenance: provenance,
    p_processing_job_id: processingJobId,
    p_paper_id: paperId,
    p_previous_status: evaluation.previousStatus,
    p_new_status: evaluation.newStatus,
    p_publish_status: evaluation.publishStatus,
    p_idempotency_key: idempotencyKey,
    p_auto_publish: evaluation.autoPublish,
  });

  if (error) throw new Error(error.message);
  return data as { event_id: string; idempotent: boolean; outcome: string };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // Allow service-role ingest key OR admin JWT
    const ingestKey = req.headers.get("x-ingest-key")?.trim();
    const expectedIngest = Deno.env.get("INGEST_API_KEY")?.trim();
    let useServiceRole = false;

    if (ingestKey && expectedIngest && ingestKey === expectedIngest) {
      useServiceRole = true;
    } else {
      const auth = await authenticateRequest(req);
      if (auth.error) return auth.error;
      const adminErr = await enforceAdmin(auth.context.user.id);
      if (adminErr) return adminErr;
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }

    const entityType = (body as Record<string, unknown>).entityType;
    if (entityType !== "question" && entityType !== "paper") {
      return json(req, { error: "entityType must be question or paper", code: "VALIDATION_ERROR" }, 400);
    }

    const entityId = uuidOrNull((body as Record<string, unknown>).entityId);
    if (!entityId) {
      return json(req, { error: "entityId UUID required", code: "VALIDATION_ERROR" }, 400);
    }

    const persist = (body as Record<string, unknown>).persist !== false;
    const validation = (body as Record<string, unknown>).validation;
    if (!validation || typeof validation !== "object") {
      return json(req, { error: "validation object required", code: "VALIDATION_ERROR" }, 400);
    }

    const db = createServiceClient();
    const rule = await loadActiveRule(db, entityType);
    if (!rule) {
      return json(req, { error: "No auto-approval rule configured", code: "NO_RULE" }, 404);
    }

    const v = validation as Record<string, unknown>;
    const input = entityType === "question"
      ? ({ entityType: "question", ...v } as QuestionValidationInput)
      : ({ entityType: "paper", ...v } as PaperValidationInput);

    const evaluation = evaluateAutoApproval(input, rule);

    const processingJobId = uuidOrNull(v.processingJobId);
    const paperId = uuidOrNull((body as Record<string, unknown>).paperId);
    const provenance = (body as Record<string, unknown>).provenance as Record<string, unknown> | null;

    const result = await persistEvaluation(
      db,
      entityType,
      entityId,
      evaluation,
      processingJobId,
      paperId,
      provenance,
      persist,
    );

    return json(req, {
      success: true,
      evaluation,
      persist: result,
    });
  } catch (err) {
    console.error("[evaluate-auto-approval]", err);
    return json(
      req,
      {
        error: err instanceof Error ? err.message : "Auto-approval evaluation failed",
        code: "AUTO_APPROVAL_FAILED",
        outcome: "AUTO_APPROVAL_FAILED",
      },
      500,
    );
  }
});
