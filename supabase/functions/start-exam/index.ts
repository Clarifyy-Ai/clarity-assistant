/**
 * start-exam — server-authoritative attempt start.
 * Sets started_at / expires_at from the database clock. Replay-safe.
 */
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";
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

Deno.serve(withBrowserCors("start-exam", async (req) => {
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
      key: createRateLimitKey("start-exam", user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await req.json().catch(() => null);
    const testId = uuidOrNull(
      body && typeof body === "object"
        ? (body as Record<string, unknown>).testId ?? (body as Record<string, unknown>).test_id
        : null,
    );
    if (!testId) {
      return json(req, { error: "testId required", code: "VALIDATION_ERROR" }, 400);
    }

    const { data: profile } = await db
      .from("profiles")
      .select("region, timezone, locale")
      .eq("id", user.id)
      .maybeSingle();

    const { data: test, error } = await db
      .from("mock_tests")
      .select("id, user_id, status, started_at, expires_at, time_limit_minutes, attempt_phase, config")
      .eq("id", testId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !test) {
      return json(req, { error: "Test not found", code: "NOT_FOUND" }, 404);
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

    try {
      const userDb = createUserClient(auth.context.accessToken);
      const { data: rpcData, error: rpcErr } = await userDb.rpc("start_owned_mock_test", {
        p_test_id: testId,
      });
      if (!rpcErr && rpcData && typeof rpcData === "object") {
        const rec = rpcData as Record<string, unknown>;
        if (rec.success === false) {
          const code = String(rec.code ?? "START_FAILED");
          const status = code === "NOT_FOUND" ? 404 : code === "UNAUTHORIZED" ? 401 : 409;
          return json(req, {
            error: code === "SUBMISSION_CONFLICT"
              ? "This exam is already submitted."
              : "Could not start the exam.",
            code,
          }, status);
        }
        return json(req, {
          success: true,
          alreadyStarted: Boolean(rec.already_started),
          startedAt: rec.started_at,
          expiresAt: rec.expires_at ?? null,
          status: rec.status,
          attemptPhase: rec.attempt_phase ?? "ACTIVE",
        });
      }
    } catch (rpcCatch) {
      console.warn("[start-exam] RPC unavailable, using service-role clock", rpcCatch);
    }

    if (test.status === "COMPLETED") {
      return json(req, {
        error: "This exam is already submitted.",
        code: "SUBMISSION_CONFLICT",
      }, 409);
    }

    if (test.status === "IN_PROGRESS" && test.started_at) {
      return json(req, {
        success: true,
        alreadyStarted: true,
        startedAt: test.started_at,
        expiresAt: test.expires_at,
        status: test.status,
        attemptPhase: test.attempt_phase ?? "ACTIVE",
      });
    }

    const now = new Date();
    const limitMins = Number(test.time_limit_minutes ?? 0);
    const expiresAt =
      Number.isFinite(limitMins) && limitMins > 0
        ? new Date(now.getTime() + limitMins * 60_000).toISOString()
        : null;

    const { data: updated, error: updErr } = await db
      .from("mock_tests")
      .update({
        status: "IN_PROGRESS",
        started_at: now.toISOString(),
        expires_at: expiresAt,
        attempt_phase: "ACTIVE",
      })
      .eq("id", testId)
      .eq("user_id", user.id)
      .in("status", ["DRAFT", "IN_PROGRESS"])
      .select("id, status, started_at, expires_at, attempt_phase, time_limit_minutes")
      .maybeSingle();

    if (updErr) {
      console.error("[start-exam] update failed", updErr);
      return json(req, { error: "Could not start the exam.", code: "START_FAILED" }, 500);
    }

    const row = updated ?? {
      status: "IN_PROGRESS",
      started_at: now.toISOString(),
      expires_at: expiresAt,
      attempt_phase: "ACTIVE",
    };

    return json(req, {
      success: true,
      alreadyStarted: false,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      status: row.status,
      attemptPhase: row.attempt_phase,
    });
  } catch (err) {
    console.error("[start-exam]", err);
    return json(req, { error: "Could not start the exam.", code: "START_FAILED" }, 500);
  }
}));
