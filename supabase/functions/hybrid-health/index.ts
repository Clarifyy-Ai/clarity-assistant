/**
 * Hybrid backend diagnostics — Edge + Python health/ready.
 *
 * Requires authenticated user (requireAuth). Does NOT expose:
 * - DOCUMENT_INTELLIGENCE_AUTH_SECRET
 * - PYTHON_SERVICE_URL (or hostname)
 * - any provider keys
 *
 * Secrets to configure for Python checks:
 * - PYTHON_SERVICE_URL
 * - DOCUMENT_INTELLIGENCE_AUTH_SECRET
 */

import { applyCors, handleCors, resolveCorrelationId } from "../_shared/cors.ts";
import { requireAuth, errorResponse } from "../_shared/utils.ts";
import { isPythonConfigured, pythonHealth, pythonReady } from "../_shared/pythonClient.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
  }

  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse("Authentication required.", "AUTH_REQUIRED", 401, req);
  }

  const correlationId = resolveCorrelationId(req);
  const configured = isPythonConfigured();
  let health: { ok: boolean; status: number; latency_ms: number } | null = null;
  let ready: { ok: boolean; status: number; latency_ms: number } | null = null;

  if (configured) {
    const [h, r] = await Promise.all([pythonHealth(), pythonReady()]);
    health = { ok: h.ok, status: h.status, latency_ms: h.latencyMs };
    ready = { ok: r.ok, status: r.status, latency_ms: r.latencyMs };
  }

  const body = {
    edge: "ok" as const,
    configured,
    python: {
      health,
      ready,
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
