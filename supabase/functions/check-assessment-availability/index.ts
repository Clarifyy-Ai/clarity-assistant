/**
 * check-assessment-availability — preflight inventory + attempt budget.
 * Same eligibility predicates as assemble_assessment_from_template.
 */
import { handleCors, getCorsHeaders, withBrowserCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest, createUserScopedClient, resolveUserPlanId } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import { requireCapabilityAsync } from "../_shared/requireCapability.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(req: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

Deno.serve(withBrowserCors("check-assessment-availability", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return applyCors(req, auth.error);
    const user = auth.context.user;

    const adminDb = createServiceClient();
    if (await isUserBanned(adminDb, user.id)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rate = await enforceSessionRateLimitAsync(adminDb, "check-assessment-availability", user.id);
    if (rate) return applyCors(req, rate);

    const planId = await resolveUserPlanId(user.id);
    const capabilityGate = await requireCapabilityAsync(planId, "mock_test", req);
    if (capabilityGate) return applyCors(req, capabilityGate);

    const body = await req.json().catch(() => ({}));
    const rec = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const single = uuidOrNull(rec.template_id ?? rec.templateId);
    const listRaw = Array.isArray(rec.template_ids)
      ? rec.template_ids
      : Array.isArray(rec.templateIds)
      ? rec.templateIds
      : single
      ? [single]
      : [];
    const templateIds = listRaw
      .map((v) => uuidOrNull(String(v ?? "")))
      .filter((v): v is string => Boolean(v));

    if (templateIds.length === 0) {
      return json(req, {
        error: "template_id or template_ids required",
        code: "INVALID_PAYLOAD",
      }, 400);
    }

    const userDb = createUserScopedClient(auth.context.accessToken);
    const { data, error } = await userDb.rpc("assessment_templates_availability", {
      p_template_ids: templateIds,
    });

    if (error) {
      console.error("[check-assessment-availability]", error.message);
      return json(req, {
        error: "Availability could not be checked.",
        code: "ASSESSMENT_START_FAILED",
      }, 500);
    }

    const payload = (data ?? {}) as {
      success?: boolean;
      items?: Array<Record<string, unknown>>;
      code?: string;
    };

    if (payload.success === false && payload.code === "UNAUTHORIZED") {
      return json(req, { error: "Sign in to check assessment availability.", code: "UNAUTHORIZED" }, 401);
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (single && items.length === 1) {
      const item = items[0]!;
      return json(req, {
        ...item,
        requested_count: item.requested,
        available_count: item.available,
      });
    }

    return json(req, {
      success: true,
      items: items.map((item) => ({
        ...item,
        requested_count: item.requested,
        available_count: item.available,
      })),
    });
  } catch (err) {
    console.error("[check-assessment-availability]", err);
    return json(req, {
      error: "Availability could not be checked.",
      code: "ASSESSMENT_START_FAILED",
    }, 500);
  }
}));
