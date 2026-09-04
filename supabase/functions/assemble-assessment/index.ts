import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, createUserScopedClient, resolveUserPlanId } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import { requireCapabilityAsync } from "../_shared/requireCapability.ts";
import {
  applyWeakBoost,
  blueprintForRole,
  buildSelectionSeed,
  buildWhySelected,
  evaluateReadiness,
  roleLabel,
} from "../_shared/assessmentPersonalization.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StartCode =
  | "INVALID_PAYLOAD"
  | "ASSESSMENT_NOT_FOUND"
  | "ASSESSMENT_NOT_AVAILABLE"
  | "ASSESSMENT_NOT_ELIGIBLE"
  | "INVALID_ASSESSMENT_TEMPLATE"
  | "INSUFFICIENT_QUESTION_INVENTORY"
  | "CONTENT_INSUFFICIENT"
  | "PROFILE_CONTEXT_INSUFFICIENT"
  | "ROLE_NOT_SUPPORTED"
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
  PROFILE_CONTEXT_INSUFFICIENT: 422,
  ROLE_NOT_SUPPORTED: 422,
  INSUFFICIENT_QUESTION_INVENTORY: 409,
  CONTENT_INSUFFICIENT: 409,
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
  CONTENT_INSUFFICIENT:
    "There is not enough approved question-bank content for this personalized blueprint.",
  PROFILE_CONTEXT_INSUFFICIENT: "We need a little more information to personalize your assessment.",
  ROLE_NOT_SUPPORTED: "That target role is not supported for assessments yet.",
  MAX_ATTEMPTS_REACHED: "You have reached the maximum number of attempts for this assessment.",
  CAPABILITY_REQUIRED: "Your current plan does not include this assessment.",
  ASSESSMENT_START_FAILED: "The assessment could not be started. Please try again.",
};

function json(req: Request, payload: unknown, status = 200): Response {
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
    (code === "INSUFFICIENT_QUESTION_INVENTORY" || code === "CONTENT_INSUFFICIENT") && hintDetails
      ? {
          available_count: hintDetails.available_count,
          requested_count: hintDetails.requested_count,
          available: hintDetails.available_count,
          requested: hintDetails.requested_count,
          required: hintDetails.requested_count,
          missingFields: hintDetails.missingFields,
        }
      : {};

  return json(
    req,
    {
      error: typeof extra?.error === "string" ? extra.error : USER_MESSAGE[code],
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
    "CONTENT_INSUFFICIENT",
    "PROFILE_CONTEXT_INSUFFICIENT",
    "ROLE_NOT_SUPPORTED",
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

    const forceGeneral = record.force_general === true;
    const setup =
      record.setup && typeof record.setup === "object" && !Array.isArray(record.setup)
        ? (record.setup as Record<string, unknown>)
        : null;

    // Personalized path requires setup; legacy template-only start remains allowed without setup.
    if (setup || record.role_slug || forceGeneral) {
      const readiness = evaluateReadiness(
        {
          ...(setup ?? {}),
          role_slug: record.role_slug ?? setup?.role_slug,
        },
        forceGeneral,
      );
      if (!readiness.ready) {
        const code: StartCode =
          readiness.reasonCode === "ROLE_NOT_SUPPORTED"
            ? "ROLE_NOT_SUPPORTED"
            : "PROFILE_CONTEXT_INSUFFICIENT";
        return fail(req, code, {
          error: readiness.message,
          details: { missingFields: readiness.missingFields },
          missingFields: readiness.missingFields,
          ready: false,
          reasonCode: readiness.reasonCode,
        });
      }
    }

    const headerKey =
      req.headers.get("x-idempotency-key") ??
      req.headers.get("Idempotency-Key") ??
      req.headers.get("idempotency-key") ??
      "";
    const bodyKey = typeof record.idempotency_key === "string" ? record.idempotency_key : "";
    const idempotencyKey = (bodyKey || headerKey).trim().slice(0, 150) || null;

    const usePersonalizedAssemble = Boolean(setup || forceGeneral || record.role_slug);
    const roleSlug = forceGeneral
      ? "general-aptitude"
      : String(record.role_slug ?? setup?.role_slug ?? "").trim();
    const weak = Array.isArray(setup?.weak_topics)
      ? (setup!.weak_topics as unknown[]).map(String)
      : [];
    const objective = String(setup?.assessment_objective ?? "role_readiness");
    const questionCountRaw = Number(setup?.question_count ?? record.question_count ?? 0);
    const questionCount = Number.isFinite(questionCountRaw) && questionCountRaw > 0
      ? Math.floor(questionCountRaw)
      : null;

    let weights: Record<string, number> | null = null;
    let boosted: string[] = [];
    let seed: string | null = null;
    let why = "";
    let personalized = false;

    if (usePersonalizedAssemble) {
      const effectiveRole = roleSlug || "general-aptitude";
      const baseline = blueprintForRole(effectiveRole, null);
      const boostedResult =
        objective === "weak_area_improvement" || objective === "mixed" || objective === "role_readiness"
          ? applyWeakBoost(baseline, weak)
          : { weights: baseline, boosted: [] as string[] };
      weights = boostedResult.weights;
      boosted = boostedResult.boosted;
      personalized = !forceGeneral;
      why = buildWhySelected({
        roleLabel: roleLabel(effectiveRole),
        objective,
        boosted,
        personalized,
      });
      seed = buildSelectionSeed(
        auth.context.user.id,
        templateId,
        effectiveRole,
        idempotencyKey,
      );
    }

    const userDb = createUserScopedClient(auth.context.accessToken);
    const { data, error } = usePersonalizedAssemble
      ? await userDb.rpc("assemble_assessment_with_blueprint", {
          p_template_id: templateId,
          p_idempotency_key: idempotencyKey,
          p_category_weights: weights,
          p_role_slug: roleSlug || "general-aptitude",
          p_question_count: questionCount,
          p_selection_seed: seed,
        })
      : await userDb.rpc("assemble_assessment_from_template", {
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

    // Attach personalization snapshot when setup present (or force_general).
    if (usePersonalizedAssemble && weights && seed) {
      const effectiveRole = roleSlug || "general-aptitude";
      // Build a lightweight ledger from frozen question ids (explainability without answer keys).
      const { data: attemptRow } = await userDb
        .from("mock_tests")
        .select("question_ids")
        .eq("id", payload.test_id)
        .maybeSingle();
      const qids = Array.isArray(attemptRow?.question_ids) ? attemptRow!.question_ids as string[] : [];
      const ledger = qids.map((qid, i) => ({
        questionId: qid,
        sequence: i + 1,
        selectedBecause: [
          `Matches ${roleLabel(effectiveRole)} role`,
          personalized ? "Selected via personalized blueprint coverage" : "Selected for general assessment",
          ...(boosted.length ? ["Addresses a previously weak topic"] : []),
        ],
        selectionPolicyVersion: "assessment-selection-v1",
        score: { total: 1 },
      }));

      const { data: attached, error: attachErr } = await userDb.rpc("attach_assessment_personalization", {
        p_test_id: payload.test_id,
        p_setup: {
          ...(setup ?? {}),
          role_slug: effectiveRole,
          force_general: forceGeneral,
        },
        p_category_weights: weights,
        p_selection_seed: seed,
        p_why_selected: why,
        p_ledger: ledger,
        p_personalized: personalized,
        p_force_general: forceGeneral,
      });

      if (attachErr) {
        console.error("[assemble-assessment] attach personalization failed:", attachErr.message);
        // Attempt already created — return success without snapshot rather than failing closed mid-flight.
        Object.assign(payload, { why_selected: why, personalized, selection_seed: seed });
      } else if (attached && typeof attached === "object") {
        Object.assign(payload, attached, { why_selected: why, personalized });
      } else {
        Object.assign(payload, { why_selected: why, personalized, selection_seed: seed });
      }
    }

    return json(req, payload, 200);
  } catch (err) {
    console.error("[assemble-assessment] Unhandled error:", err instanceof Error ? err.message : "unknown");
    return fail(req, "ASSESSMENT_START_FAILED");
  }
});
