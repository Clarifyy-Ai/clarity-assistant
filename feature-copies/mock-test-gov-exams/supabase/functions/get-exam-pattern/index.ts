/**
 * get-exam-pattern — JWT; examId + stageId → approved pattern version + sections.
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
      key: createRateLimitKey("get-exam-pattern", user.id),
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

    const { data: pattern, error } = await db
      .from("gov_exam_pattern_versions")
      .select(
        "id, exam_id, stage_id, version, effective_date, total_questions, total_marks, duration_minutes, negative_mark, marks_per_question, languages, source_url, notes, review_state",
      )
      .eq("exam_id", examId)
      .eq("stage_id", stageId)
      .eq("review_state", "approved")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[get-exam-pattern]", error);
      return json(req, { error: "Lookup failed", code: "INTERNAL_ERROR" }, 500);
    }

    if (!pattern) {
      return json(req, {
        error: "Approved pattern not available",
        code: "PATTERN_NOT_AVAILABLE",
      }, 404);
    }

    const { data: sections } = await db
      .from("gov_exam_sections")
      .select("id, code, name, question_count, marks, sort_order")
      .eq("pattern_version_id", pattern.id)
      .order("sort_order", { ascending: true });

    return json(req, {
      examId,
      stageId,
      pattern: {
        id: pattern.id,
        version: pattern.version,
        effectiveDate: pattern.effective_date,
        totalQuestions: pattern.total_questions,
        totalMarks: Number(pattern.total_marks),
        durationMinutes: pattern.duration_minutes,
        negativeMark: Number(pattern.negative_mark),
        marksPerQuestion: Number(pattern.marks_per_question),
        languages: (pattern.languages as string[] | null) ?? ["en"],
        sourceUrl: pattern.source_url,
        notes: pattern.notes,
      },
      sections: (sections ?? []).map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        questionCount: s.question_count,
        marks: Number(s.marks),
        sortOrder: s.sort_order,
      })),
    });
  } catch (err) {
    console.error("[get-exam-pattern]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
