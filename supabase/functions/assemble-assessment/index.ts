import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, createUserScopedClient, resolveUserPlanId } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import { requireCapabilityAsync } from "../_shared/requireCapability.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StartCode =
  | "INVALID_PAYLOAD"
  | "ASSESSMENT_NOT_FOUND"
  | "ASSESSMENT_NOT_AVAILABLE"
  | "ASSESSMENT_NOT_ELIGIBLE"
  | "INVALID_ASSESSMENT_TEMPLATE"
  | "INSUFFICIENT_QUESTION_INVENTORY"
  | "MAX_ATTEMPTS_REACHED"
  | "CAPABILITY_REQUIRED"
  | "ASSESSMENT_START_FAILED"
  | "UNAUTHORIZED";

const HTTP_FOR: Record<StartCode, number> = {
  INVALID_PAYLOAD: 400,
  UNAUTHORIZED: 401,
  ASSESSMENT_NOT_ELIGIBLE: 403,
  MAX_ATTEMPTS_REACHED: 403,
  CAPABILITY_REQUIRED: 403,
  ASSESSMENT_NOT_FOUND: 404,
  ASSESSMENT_NOT_AVAILABLE: 404,
  INVALID_ASSESSMENT_TEMPLATE: 422,
  INSUFFICIENT_QUESTION_INVENTORY: 409,
  ASSESSMENT_START_FAILED: 500,
};

const USER_MESSAGE: Record<StartCode, string> = {
  INVALID_PAYLOAD: "This assessment could not be started because the request was invalid.",
  UNAUTHORIZED: "Sign in to start this assessment.",
  ASSESSMENT_NOT_FOUND: "That assessment template was not found.",
  ASSESSMENT_NOT_AVAILABLE: "This assessment is not currently available.",
  ASSESSMENT_NOT_ELIGIBLE: "You are not eligible to start this assessment.",
  INVALID_ASSESSMENT_TEMPLATE: "This assessment template is invalid and cannot be started.",
  INSUFFICIENT_QUESTION_INVENTORY: "There are not enough eligible questions to start this assessment.",
  MAX_ATTEMPTS_REACHED: "You have reached the maximum number of attempts for this assessment.",
  CAPABILITY_REQUIRED: "Your current plan does not include this assessment.",
  ASSESSMENT_START_FAILED: "The assessment could not be started. Please try again.",
};

function json(
  req: Request,
  payload: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(req: Request, code: StartCode, extra?: Record<string, unknown>): Response {
  const hintDetails =
    extra?.details && typeof extra.details === "object"
      ? extra.details as Record<string, unknown>
      : undefined;
  const inventory =
    code === "INSUFFICIENT_QUESTION_INVENTORY" && hintDetails
      ? {
          available_count: hintDetails.available_count,
          requested_count: hintDetails.requested_count,
          available: hintDetails.available_count,
          requested: hintDetails.requested_count,
          required: hintDetails.requested_count,
        }
      : {};

  return json(
    req,
    {
      error: USER_MESSAGE[code],
      code,
      ...(extra ?? {}),
      ...inventory,
    },
    HTTP_FOR[code],
  );
}

function parseHint(hint: string | null | undefined): Record<string, unknown> | undefined {
  if (!hint) return undefined;
  try {
    const parsed = JSON.parse(hint) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function mapRpcCode(message: string, details: string | null, hint: string | null): {
  code: StartCode;
  details?: Record<string, unknown>;
} {
  const hintDetails = parseHint(hint);
  const known = details?.trim();
  const allowed: StartCode[] = [
    "INVALID_PAYLOAD",
    "ASSESSMENT_NOT_FOUND",
    "ASSESSMENT_NOT_AVAILABLE",
    "ASSESSMENT_NOT_ELIGIBLE",
    "INVALID_ASSESSMENT_TEMPLATE",
    "INSUFFICIENT_QUESTION_INVENTORY",
    "MAX_ATTEMPTS_REACHED",
    "CAPABILITY_REQUIRED",
    "ASSESSMENT_START_FAILED",
    "UNAUTHORIZED",
  ];
  if (known && (allowed as string[]).includes(known)) {
    return { code: known as StartCode, details: hintDetails };
  }
  const lower = message.toLowerCase();
  if (lower.includes("not authenticated")) return { code: "UNAUTHORIZED" };
  if (lower.includes("maximum attempts")) return { code: "MAX_ATTEMPTS_REACHED" };
  if (lower.includes("not enough") || lower.includes("insufficient")) {
    return { code: "INSUFFICIENT_QUESTION_INVENTORY", details: hintDetails };
  }
  if (lower.includes("template not found")) return { code: "ASSESSMENT_NOT_FOUND" };
  if (lower.includes("not available") || lower.includes("not published")) {
    return { code: "ASSESSMENT_NOT_AVAILABLE" };
  }
  if (lower.includes("invalid") && lower.includes("template")) {
    return { code: "INVALID_ASSESSMENT_TEMPLATE" };
  }
  return { code: "ASSESSMENT_START_FAILED" };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method.toUpperCase() !== "POST") {
      return json(req, { error: "Method not allowed.", code: "INVALID_PAYLOAD" }, 405);
    }

    const auth = await authenticateRequest(req);
    if (auth.error || !auth.context) {
      return auth.error ?? fail(req, "UNAUTHORIZED");
    }

    const rateLimited = await enforceSessionRateLimitAsync(
      createServiceClient(),
      "assemble-assessment",
      auth.context.user.id,
    );
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    const planId = await resolveUserPlanId(auth.context.user.id);
    const capabilityGate = await requireCapabilityAsync(planId, "mock_test", req);
    if (capabilityGate) return withCorsHeaders(req, capabilityGate);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(req, "INVALID_PAYLOAD");
    }
    const record = body as Record<string, unknown>;
    const templateId = String(record.template_id ?? "").trim();
    if (!templateId || !UUID_RE.test(templateId)) {
      return fail(req, "INVALID_PAYLOAD");
    }

    const headerKey =
      req.headers.get("x-idempotency-key") ??
      req.headers.get("Idempotency-Key") ??
      req.headers.get("idempotency-key") ??
      "";
    const bodyKey = typeof record.idempotency_key === "string" ? record.idempotency_key : "";
    const idempotencyKey = (bodyKey || headerKey).trim().slice(0, 150) || null;

    const userDb = createUserScopedClient(auth.context.accessToken);
    const { data, error } = await userDb.rpc("assemble_assessment_from_template", {
      p_template_id: templateId,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const mapped = mapRpcCode(error.message ?? "", error.details ?? null, error.hint ?? null);
      console.error("[assemble-assessment] RPC failed:", mapped.code, error.message);
      return fail(req, mapped.code, mapped.details ? { details: mapped.details } : undefined);
    }

    const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (!payload.test_id) {
      return fail(req, "ASSESSMENT_START_FAILED");
    }
    return json(req, payload, 200);
  } catch (err) {
    console.error("[assemble-assessment] Unhandled error:", err instanceof Error ? err.message : "unknown");
    return fail(req, "ASSESSMENT_START_FAILED");
  }
});
