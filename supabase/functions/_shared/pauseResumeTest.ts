/**
 * pause-test / resume-test — server-authoritative assessment timer pause.
 * Extends expires_at only via SECURITY DEFINER RPC on resume.
 */
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest, createUserScopedClient } from "../_shared/auth.ts";
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

function rpcStatus(code: string): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "ATTEMPT_NOT_STARTED":
    case "ATTEMPT_EXPIRED":
    case "SUBMISSION_CONFLICT":
      return 409;
    default:
      return 500;
  }
}

async function handlePhaseAction(
  req: Request,
  rpcName: "pause_owned_mock_test" | "resume_owned_mock_test",
) {
  const cors = handleCors(req);
  if (cors) return cors;

  const adminDb = createServiceClient();
  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    if (await isUserBanned(adminDb, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimitResult = await checkRateLimitAsync(adminDb, {
      key: createRateLimitKey(rpcName, user.id),
      ...RATE_LIMIT_PRESETS.SESSION_ACTION,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, req);
    }

    const body = await req.json().catch(() => null);
    const rec = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const testId = uuidOrNull(rec.testId ?? rec.test_id);
    if (!testId) {
      return json(req, { error: "testId required", code: "VALIDATION_ERROR" }, 400);
    }

    const userDb = createUserScopedClient(auth.context.accessToken);
    const { data, error } = await userDb.rpc(rpcName, { p_test_id: testId });
    if (error) {
      console.error(`[${rpcName}]`, error.message);
      return json(req, { error: "Could not update timer state.", code: "SAVE_FAILED" }, 500);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    if (result.success === false) {
      const code = String(result.code ?? "SAVE_FAILED");
      return json(req, {
        error: "Could not update timer state.",
        code,
      }, rpcStatus(code));
    }

    return json(req, {
      success: true,
      attemptPhase: result.attempt_phase,
      pausedAt: result.paused_at ?? null,
      expiresAt: result.expires_at ?? null,
      totalPausedMs: result.total_paused_ms ?? 0,
      startedAt: result.started_at ?? null,
      alreadyPaused: result.already_paused === true,
      alreadyActive: result.already_active === true,
      pauseMsApplied: result.pause_ms_applied ?? 0,
    });
  } catch (err) {
    console.error(`[${rpcName}]`, err);
    return json(req, { error: "Could not update timer state.", code: "SAVE_FAILED" }, 500);
  }
}

export { handlePhaseAction, json, uuidOrNull };
