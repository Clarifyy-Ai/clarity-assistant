/**
 * get-exam-syllabus — JWT; examId + stageId → approved syllabus topics_json.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";

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

  const db = createServiceClient();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    if (await isUserBanned(db, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("get-exam-syllabus", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const url = new URL(req.url);
    let examId = uuidOrNull(url.searchParams.get("examId"));
    let stageId = uuidOrNull(url.searchParams.get("stageId"));

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        if (!examId) examId = uuidOrNull(b.examId);
        if (!stageId) stageId = uuidOrNull(b.stageId);
      }
    }

    if (!examId || !stageId) {
      return json(req, {
        error: "examId and stageId are required UUIDs",
        code: "VALIDATION_ERROR",
      }, 400);
    }

    const { data: syllabus, error } = await db
      .from("gov_exam_syllabus_versions")
      .select(
        "id, exam_id, stage_id, version, effective_date, source_url, topics_json, review_state",
      )
      .eq("exam_id", examId)
      .eq("stage_id", stageId)
      .eq("review_state", "approved")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[get-exam-syllabus]", error);
      return json(req, { error: "Lookup failed", code: "INTERNAL_ERROR" }, 500);
    }

    if (!syllabus) {
      return json(req, {
        error: "Approved syllabus not available",
        code: "SYLLABUS_NOT_AVAILABLE",
      }, 404);
    }

    return json(req, {
      examId,
      stageId,
      syllabus: {
        id: syllabus.id,
        version: syllabus.version,
        effectiveDate: syllabus.effective_date,
        sourceUrl: syllabus.source_url,
        topicsJson: syllabus.topics_json ?? [],
      },
    });
  } catch (err) {
    console.error("[get-exam-syllabus]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
