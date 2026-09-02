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
import { listHybridOperations } from "../_shared/operationRouter.ts";

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

function chaosFlagEnabled(name: string): boolean {
  const v = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
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
  let pythonSupported: { ok: boolean; count?: number } | null = null;
  let pythonAlerts: { ok: boolean; count?: number } | null = null;
  let pythonMetrics: { ok: boolean } | null = null;

  if (configured) {
    const probeId = (correlationId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 20) || "x0000000");
    const [h, r, signed, supported, alerts, metrics] = await Promise.all([
      pythonHealth(),
      pythonReady(),
      pythonFetch("/internal/gov-exams/health", {
        method: "GET",
        timeoutMs: 8_000,
        requestId: `hh-gov-${probeId}`,
      }),
      pythonFetch("/internal/operations/supported", {
        method: "GET",
        timeoutMs: 8_000,
        requestId: `hh-ops-${probeId}`,
      }),
      pythonFetch("/alerts", {
        method: "GET",
        timeoutMs: 8_000,
        requestId: `hh-alerts-${probeId}`,
      }),
      pythonFetch("/metrics", {
        method: "GET",
        timeoutMs: 8_000,
        requestId: `hh-metrics-${probeId}`,
      }),
    ]);
    health = { ok: h.ok, status: h.status, latency_ms: h.latencyMs };
    ready = { ok: r.ok, status: r.status, latency_ms: r.latencyMs };

    // Public /health can be green while HMAC is wrong — probe a signed route.
    signedInternal = {
      ok: signed.ok,
      status: signed.status,
      latency_ms: signed.latencyMs,
      code: signed.ok
        ? undefined
        : String(signed.errorCode ?? "PYTHON_HMAC_FAILED"),
    };

    const supportedJson =
      supported.json && typeof supported.json === "object"
        ? (supported.json as Record<string, unknown>)
        : null;
    const supportedOps = Array.isArray(supportedJson?.operations)
      ? supportedJson.operations
      : [];
    pythonSupported = {
      ok: supported.ok,
      count: supported.ok ? supportedOps.length : undefined,
    };

    const alertsJson =
      alerts.json && typeof alerts.json === "object"
        ? (alerts.json as Record<string, unknown>)
        : null;
    const alertCount =
      typeof alertsJson?.total_active === "number"
        ? alertsJson.total_active
        : Array.isArray(alertsJson?.alerts)
          ? alertsJson.alerts.length
          : undefined;
    pythonAlerts = {
      ok: alerts.ok,
      count: alerts.ok ? alertCount ?? 0 : undefined,
    };

    pythonMetrics = { ok: metrics.ok };
  }

  const publicOk = Boolean(health?.ok && ready?.ok);
  const hmacOk = Boolean(signedInternal?.ok);
  const pythonUp = configured && hmacOk;
  const pythonDown = configured && !publicOk;
  const pythonStatus = !configured
    ? "not_configured"
    : hmacOk
    ? "ok"
    : publicOk
    ? "hmac_mismatch"
    : "degraded";

  const billing = validateBillingConfig({
    requireRazorpay: true,
    requireStripe: false,
    requireRazorpayWebhook: true,
  });
  const razorpayId = present("RAZORPAY_KEY_ID");
  const razorpaySecret = present("RAZORPAY_KEY_SECRET");
  const razorpayWebhookSecret = present("RAZORPAY_WEBHOOK_SECRET");
  const razorpayConfigured = razorpayId && razorpaySecret;
  const razorpayKeyMode = razorpayId.startsWith("rzp_live_")
    ? "live"
    : razorpayId.startsWith("rzp_test_")
    ? "test"
    : "unknown";
  const razorpayChecks = billing.checks.filter((c) => c.name.startsWith("RAZORPAY_"));
  const razorpayValid =
    razorpayConfigured &&
    razorpayWebhookSecret &&
    razorpayChecks.every((c) => !c.present || (c.formatValid && c.environmentCompatible));

  const body = {
    edge: "ok" as const,
    configured,
    required: requiredOk ? "ok" : "service-unavailable",
    db,
    storage,
    /** MATRIX hybrid operations + Edge wrappers that expose them. */
    supported_operations: listHybridOperations(),
    operations_count: listHybridOperations().length,
    edge_operation_wrappers: {
      sprint_review_transcript: "process-sprint-transcript",
      document_process: "create-document-processing-job",
      gov_exam_assemble: "create-exam-paper",
    },
    python: {
      configured,
      /** True only when signed internal auth succeeds — not merely /health. */
      hmac_ok: hmacOk,
      /** Explicit up/down for chaos probes (signed route is authoritative). */
      up: pythonUp,
      down: pythonDown,
      gov_exam_client_configured: isPythonGovExamConfigured(),
      status: pythonStatus,
      health,
      ready,
      signed_internal: signedInternal,
      /** Counts only — never dump operation names, alert bodies, or Prometheus text. */
      supported: pythonSupported,
      alerts: pythonAlerts,
      metrics: pythonMetrics,
    },
    ai: {
      gemini: classifyOptional(present("GEMINI_API_KEY") || present("GOOGLE_AI_API_KEY")),
      openai: classifyOptional(present("OPENAI_API_KEY")),
      anthropic: classifyOptional(present("ANTHROPIC_API_KEY")),
    },
    /** Chaos / failure-simulation flags (presence only — never echo values). */
    chaos: {
      force_ai_unavailable: chaosFlagEnabled("HYBRID_FORCE_AI_UNAVAILABLE"),
      force_python_unavailable: chaosFlagEnabled("HYBRID_FORCE_PYTHON_UNAVAILABLE"),
    },
    razorpay: {
      configured: razorpayConfigured,
      valid: razorpayValid,
      status: !razorpayConfigured ? "not_configured" : razorpayValid ? "ok" : "invalid",
      webhook_secret_configured: razorpayWebhookSecret,
      key_mode: razorpayKeyMode,
    },
    integrations: {
      deepgram: classifyOptional(present("DEEPGRAM_API_KEY")),
      resend: classifyOptional(present("RESEND_API_KEY")),
      calendar: classifyOptional(
        present("GOOGLE_CLIENT_ID") ||
          present("GOOGLE_OAUTH_CLIENT_ID") ||
          present("GOOGLE_CALENDAR_CLIENT_ID"),
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
