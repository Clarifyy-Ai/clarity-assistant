/**
 * Hybrid backend diagnostics — Edge + Python + integration presence.
 *
 * Admin-only. Does NOT expose:
 * - DOCUMENT_INTELLIGENCE_AUTH_SECRET
 * - PYTHON_SERVICE_URL (or hostname)
 * - any provider keys or secret values
 *
 * Env classification (internal; never echo variable names to clients):
 * REQUIRED: Supabase URL / anon / service role
 * FEATURE-SPECIFIC: Gemini, OpenAI, Anthropic, Deepgram, Razorpay,
 *   Python HMAC, Resend, Google Calendar, Sentry, PostHog
 * Missing optional → "Integration not configured"
 * Missing required → "service-unavailable"
 */

import { applyCors, handleCors, resolveCorrelationId } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/utils.ts";
import {
  authenticateRequest,
  enforceAdmin,
  createServiceRoleClient,
} from "../_shared/auth.ts";
import { isPythonConfigured, pythonFetch, pythonHealth, pythonReady } from "../_shared/pythonClient.ts";
import { isPythonGovExamConfigured } from "../_shared/pythonGovExamClient.ts";
import { validateBillingConfig } from "../_shared/billingConfig.ts";

function present(name: string): boolean {
  return Boolean(Deno.env.get(name)?.trim());
}

function classifyOptional(configured: boolean): {
  configured: boolean;
  status: "ok" | "not_configured";
} {
  return {
    configured,
    status: configured ? "ok" : "not_configured",
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;
  const adminGate = await enforceAdmin(auth.context.user.id);
  if (adminGate) return adminGate;

  const correlationId = resolveCorrelationId(req);

  const requiredOk = Boolean(
    Deno.env.get("SUPABASE_URL")?.trim() &&
      Deno.env.get("SUPABASE_ANON_KEY")?.trim() &&
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim(),
  );

  let db: { ok: boolean; status: "ok" | "service-unavailable" } = {
    ok: requiredOk,
    status: requiredOk ? "ok" : "service-unavailable",
  };
  let storage: { ok: boolean; status: "ok" | "not_configured" | "service-unavailable" } = {
    ok: false,
    status: requiredOk ? "not_configured" : "service-unavailable",
  };

  if (requiredOk) {
    try {
      const supabase = createServiceRoleClient();
      const { error: dbErr } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      db = dbErr
        ? { ok: false, status: "service-unavailable" }
        : { ok: true, status: "ok" };

      const { error: storageErr } = await supabase.storage
        .from("question-images")
        .list("", { limit: 1 });
      storage = storageErr
        ? { ok: false, status: "not_configured" }
        : { ok: true, status: "ok" };
    } catch {
      db = { ok: false, status: "service-unavailable" };
      storage = { ok: false, status: "service-unavailable" };
    }
  }

  const configured = isPythonConfigured();
  let health: { ok: boolean; status: number; latency_ms: number } | null = null;
  let ready: { ok: boolean; status: number; latency_ms: number } | null = null;
  let signedInternal: {
    ok: boolean;
    status: number;
    latency_ms: number;
    code?: string;
  } | null = null;

  if (configured) {
    const [h, r] = await Promise.all([pythonHealth(), pythonReady()]);
    health = { ok: h.ok, status: h.status, latency_ms: h.latencyMs };
    ready = { ok: r.ok, status: r.status, latency_ms: r.latencyMs };

    // Public /health can be green while HMAC is wrong — probe a signed route.
    const signedStarted = Date.now();
    const signed = await pythonFetch("/internal/gov-exams/health", {
      method: "GET",
      timeoutMs: 8_000,
      requestId: `hybrid-health-${correlationId.slice(0, 24)}`,
    });
    signedInternal = {
      ok: signed.ok,
      status: signed.status,
      latency_ms: Date.now() - signedStarted,
      code: signed.ok
        ? undefined
        : String(signed.errorCode ?? "PYTHON_HMAC_FAILED"),
    };
  }

  const publicOk = Boolean(health?.ok && ready?.ok);
  const hmacOk = Boolean(signedInternal?.ok);
  const pythonStatus = !configured
    ? "not_configured"
    : hmacOk
    ? "ok"
    : publicOk
    ? "hmac_mismatch"
    : "degraded";

  const billing = validateBillingConfig({
    requireRazorpay: false,
    requireStripe: false,
    requireRazorpayWebhook: false,
  });
  const razorpayId = present("RAZORPAY_KEY_ID");
  const razorpaySecret = present("RAZORPAY_KEY_SECRET");
  const razorpayConfigured = razorpayId && razorpaySecret;
  const razorpayChecks = billing.checks.filter((c) => c.name.startsWith("RAZORPAY_"));
  const razorpayValid =
    razorpayConfigured &&
    razorpayChecks.every((c) => !c.present || (c.formatValid && c.environmentCompatible));

  const body = {
    edge: "ok" as const,
    configured,
    required: requiredOk ? "ok" : "service-unavailable",
    db,
    storage,
    python: {
      configured,
      /** True only when signed internal auth succeeds — not merely /health. */
      hmac_ok: hmacOk,
      gov_exam_client_configured: isPythonGovExamConfigured(),
      status: pythonStatus,
      health,
      ready,
      signed_internal: signedInternal,
    },
    ai: {
      gemini: classifyOptional(present("GEMINI_API_KEY") || present("GOOGLE_AI_API_KEY")),
      openai: classifyOptional(present("OPENAI_API_KEY")),
      anthropic: classifyOptional(present("ANTHROPIC_API_KEY")),
    },
    razorpay: {
      configured: razorpayConfigured,
      valid: razorpayValid,
      status: !razorpayConfigured ? "not_configured" : razorpayValid ? "ok" : "invalid",
    },
    integrations: {
      deepgram: classifyOptional(present("DEEPGRAM_API_KEY")),
      resend: classifyOptional(present("RESEND_API_KEY")),
      calendar: classifyOptional(
        present("GOOGLE_CALENDAR_CLIENT_ID") || present("GOOGLE_CLIENT_ID"),
      ),
      sentry: classifyOptional(present("SENTRY_DSN")),
      posthog: classifyOptional(present("POSTHOG_KEY") || present("POSTHOG_API_KEY")),
    },
    correlation_id: correlationId,
  };

  return applyCors(
    req,
    new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }),
    correlationId,
  );
});
