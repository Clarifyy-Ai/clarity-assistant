/**
 * report-question — JWT; insert content quality incident (rate limited).
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

const ALLOWED_REASONS = new Set([
  "incorrect_answer",
  "ambiguous",
  "outdated",
  "offensive",
  "duplicate",
  "poor_quality",
  "wrong_topic",
  "translation_issue",
  "other",
]);

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
      key: createRateLimitKey("report-question", user.id),
      ...RATE_LIMIT_PRESETS.AUTH_SENSITIVE,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(req, { error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
    }

    const questionId = uuidOrNull((body as Record<string, unknown>).questionId);
    const reasonRaw = String((body as Record<string, unknown>).reason ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 64);
    const notes = String((body as Record<string, unknown>).notes ?? "")
      .trim()
      .slice(0, 2000);

    if (!questionId) {
      return json(req, { error: "questionId required", code: "VALIDATION_ERROR" }, 400);
    }
    if (!ALLOWED_REASONS.has(reasonRaw)) {
      return json(req, {
        error: `reason must be one of: ${[...ALLOWED_REASONS].join(", ")}`,
        code: "VALIDATION_ERROR",
      }, 400);
    }

    const { data: q, error: qErr } = await db
      .from("questions")
      .select("id")
      .eq("id", questionId)
      .maybeSingle();

    if (qErr || !q) {
      return json(req, { error: "Question not found", code: "NOT_FOUND" }, 404);
    }

    const row = {
      question_id: questionId,
      reported_by: user.id,
      reason: reasonRaw,
      notes: notes || null,
      status: "open",
      metadata: {},
    };

    // Prefer content_quality_incidents; fall back to question_quality_reports if present.
    let incidentId: string | null = null;
    let tableUsed = "content_quality_incidents";

    const primary = await db
      .from("content_quality_incidents")
      .insert(row)
      .select("id")
      .single();

    if (primary.error) {
      console.warn(
        "[report-question] content_quality_incidents insert failed:",
        primary.error.message,
      );
      tableUsed = "question_quality_reports";
      const fallback = await db
        .from("question_quality_reports")
        .insert({
          question_id: questionId,
          user_id: user.id,
          reason: reasonRaw,
          notes: notes || null,
          status: "open",
        })
        .select("id")
        .single();

      if (fallback.error || !fallback.data) {
        console.error("[report-question] fallback insert:", fallback.error);
        return json(req, {
          error:
            "Reporting table unavailable. Apply content_quality_incidents migration.",
          code: "SCHEMA_UNAVAILABLE",
        }, 503);
      }
      incidentId = fallback.data.id as string;
    } else {
      incidentId = primary.data?.id as string;
    }

    return json(req, {
      ok: true,
      incidentId,
      table: tableUsed,
      questionId,
      reason: reasonRaw,
    }, 201);
  } catch (err) {
    console.error("[report-question]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
