/**
 * reconcile-paper-quality — admin-only re-score of a gov_generated_paper.
 * Bank / deterministic validators only; does not LLM-fill.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, enforceAdmin } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  resolveCorrectIndex,
  findNearDuplicatesInSet,
} from "../_shared/govMcqValidator.ts";
import { scorePaperQuality } from "../_shared/govQualityScore.ts";
import {
  runBankMultiAgentValidation,
  validatePaperSimilarity,
} from "../_shared/govMultiAgentValidation.ts";

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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;

    const adminErr = await enforceAdmin(auth.context.user.id);
    if (adminErr) return adminErr;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }

    const paperId = uuidOrNull((body as Record<string, unknown>).paperId);
    if (!paperId) {
      return json(req, { error: "paperId UUID required", code: "VALIDATION_ERROR" }, 400);
    }

    const persist = (body as Record<string, unknown>).persist !== false;
    const db = createServiceClient();

    const { data: paper, error: paperErr } = await db
      .from("gov_generated_papers")
      .select("id, language, provenance_json, quality_score, review_state")
      .eq("id", paperId)
      .maybeSingle();

    if (paperErr || !paper) {
      return json(req, { error: "Paper not found", code: "NOT_FOUND" }, 404);
    }

    const { data: links, error: linkErr } = await db
      .from("gov_generated_paper_questions")
      .select("question_id, sort_order")
      .eq("paper_id", paperId)
      .order("sort_order", { ascending: true });

    if (linkErr) {
      return json(req, { error: linkErr.message, code: "QUERY_FAILED" }, 500);
    }

    const qids = (links ?? []).map((l) => l.question_id as string);
    if (!qids.length) {
      return json(req, {
        paperId,
        qualityScore: 0,
        hardFailCount: 0,
        nearDuplicatePairs: [],
        disagreements: [],
        message: "Paper has no linked questions.",
      });
    }

    const { data: questions, error: qErr } = await db
      .from("questions")
      .select("id, question_text, options, correct_answer")
      .in("id", qids);

    if (qErr) {
      return json(req, { error: qErr.message, code: "QUERY_FAILED" }, 500);
    }

    const byId = new Map((questions ?? []).map((q) => [q.id as string, q]));
    const ordered = qids.map((id) => byId.get(id)).filter(Boolean) as Array<{
      id: string;
      question_text: string;
      options: unknown;
      correct_answer: unknown;
    }>;

    const stems = ordered.map((q) => String(q.question_text ?? ""));
    const paperSim = validatePaperSimilarity(stems);
    const residual = findNearDuplicatesInSet(stems);

    const disagreements: unknown[] = [];
    const scoredInputs = ordered.map((row, idx) => {
      const options = Array.isArray(row.options)
        ? row.options.map((o) => String(o))
        : [];
      const correct_index = resolveCorrectIndex(row.correct_answer, options.length) ?? 0;
      const peers = stems.filter((_, j) => j !== idx);
      const agent = runBankMultiAgentValidation({
        question_text: String(row.question_text ?? ""),
        options,
        correct_index,
        peers,
        sourceConfidence: 0.8,
        language: String(paper.language ?? "en"),
      });
      if (agent.disagreements.length) {
        disagreements.push({
          questionId: row.id,
          disagreements: agent.disagreements,
        });
      }
      return {
        question_text: String(row.question_text ?? ""),
        options,
        correct_index,
        peers,
        sourceConfidence: 0.8,
      };
    });

    const paperQuality = scorePaperQuality(scoredInputs);

    const nextReview =
      paperQuality.hardFailCount > 0 ||
        !paperSim.ok ||
        residual.length > 0 ||
        disagreements.length > 0
        ? "needs_review"
        : "machine_validated";

    if (persist) {
      const prevProvenance =
        paper.provenance_json && typeof paper.provenance_json === "object"
          ? paper.provenance_json as Record<string, unknown>
          : {};
      await db
        .from("gov_generated_papers")
        .update({
          quality_score: paperQuality.score,
          review_state: nextReview,
          provenance_json: {
            ...prevProvenance,
            last_reconcile: {
              at: new Date().toISOString(),
              quality_score: paperQuality.score,
              hard_fail_count: paperQuality.hardFailCount,
              near_duplicate_pairs: paperSim.pairs,
              disagreement_count: disagreements.length,
            },
          },
        })
        .eq("id", paperId);
    }

    return json(req, {
      paperId,
      qualityScore: paperQuality.score,
      hardFailCount: paperQuality.hardFailCount,
      nearDuplicatePairs: paperSim.pairs,
      disagreements,
      reviewState: nextReview,
      persisted: persist,
      previousQualityScore: paper.quality_score,
    });
  } catch (err) {
    console.error("[reconcile-paper-quality]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
