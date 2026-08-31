/**
 * start-exam-attempt — server-authoritative started_at / expires_at.
 * Duplicate start returns the same timestamps. Owner-only.
 */
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { resolveIsIndiaProfile } from "../_shared/indiaRegion.ts";
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

Deno.serve(withBrowserCors("start-exam-attempt", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    if (await isUserBanned(db, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey("start-exam-attempt", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await req.json().catch(() => null);
    const attemptId = uuidOrNull(
      body && typeof body === "object" ? (body as Record<string, unknown>).attemptId : null,
    );
    if (!attemptId) {
      return json(req, { error: "attemptId required", code: "VALIDATION_ERROR" }, 400);
    }

    const { data: profile } = await db
      .from("profiles")
      .select("region, timezone, locale")
      .eq("id", user.id)
      .maybeSingle();

    const { data: test, error } = await db
      .from("mock_tests")
      .select("id, user_id, status, started_at, expires_at, time_limit_minutes, config")
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !test) {
      return json(req, { error: "Attempt not found", code: "ATTEMPT_NOT_FOUND" }, 404);
    }

    const cfgPreview = (test.config && typeof test.config === "object"
      ? test.config
      : {}) as Record<string, unknown>;
    const isGovExam = Boolean(cfgPreview.gov_exam_id || cfgPreview.govExamId);
    if (isGovExam && !resolveIsIndiaProfile(profile)) {
      return json(req, {
        error: "Government exams are available for India accounts.",
        code: "REGION_RESTRICTED",
      }, 403);
    }

    if (test.status === "COMPLETED" || test.status === "ABANDONED") {
      return json(req, {
        error: "This attempt is already finished.",
        code: "SUBMISSION_CONFLICT",
        status: test.status,
        startedAt: test.started_at,
        expiresAt: test.expires_at,
      }, 409);
    }

    if (test.status === "IN_PROGRESS" && test.started_at) {
      return json(req, {
        attemptId: test.id,
        status: "IN_PROGRESS",
        startedAt: test.started_at,
        expiresAt: test.expires_at,
        idempotentReplay: true,
      });
    }

    const cfg = (test.config && typeof test.config === "object"
      ? test.config
      : {}) as Record<string, unknown>;
    const limitMins = Number(test.time_limit_minutes ?? cfg.durationMinutes ?? cfg.duration_minutes ?? 0);
    const startedAt = new Date().toISOString();
    const expiresAt =
      Number.isFinite(limitMins) && limitMins > 0
        ? new Date(Date.now() + limitMins * 60_000).toISOString()
        : null;

    const { data: updated, error: updErr } = await db
      .from("mock_tests")
      .update({
        status: "IN_PROGRESS",
        started_at: startedAt,
        expires_at: expiresAt,
        attempt_phase: "ACTIVE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .in("status", ["DRAFT", "NOT_STARTED"])
      .select("id, status, started_at, expires_at")
      .maybeSingle();

    if (updErr) {
      console.error("[start-exam-attempt]", updErr);
      return json(req, { error: "Failed to start attempt", code: "INTERNAL_ERROR" }, 500);
    }

    if (!updated) {
      const { data: raced } = await db
        .from("mock_tests")
        .select("id, status, started_at, expires_at")
        .eq("id", attemptId)
        .eq("user_id", user.id)
        .maybeSingle();
      return json(req, {
        attemptId,
        status: raced?.status ?? "IN_PROGRESS",
        startedAt: raced?.started_at ?? startedAt,
        expiresAt: raced?.expires_at ?? expiresAt,
        idempotentReplay: true,
      });
    }

    return json(req, {
      attemptId: updated.id,
      status: updated.status,
      startedAt: updated.started_at,
      expiresAt: updated.expires_at,
    });
  } catch (err) {
    console.error("[start-exam-attempt]", err);
    return json(req, { error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
}));
