import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { logger, withRequestId } from "../_shared/logger.ts";
import { startTimer } from "../_shared/timing.ts";

const BOOT_TIME = Date.now();

function hasServiceRoleAuth(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey) return false;

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey") ?? req.headers.get("Apikey") ?? "";

  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : authHeader.trim();

  return bearer === serviceKey || apiKeyHeader === serviceKey;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const corsHeaders = getCorsHeaders(req);

  // Public probe: minimal response — no DB/API key presence leaks.
  if (!hasServiceRoleAuth(req)) {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const requestId = withRequestId();
  const overall = startTimer();

  const checks: Record<string, { status: string; duration_ms: number }> = {};
  let allHealthy = true;

  const dbTimer = startTimer();
  try {
    const db = createServiceClient();
    const { error: pingError } = await db
      .from("profiles")
      .select("id")
      .limit(1);
    if (pingError) throw pingError;
    checks.database = { status: "ok", duration_ms: dbTimer.elapsed() };
  } catch (err) {
    allHealthy = false;
    checks.database = { status: "error", duration_ms: dbTimer.elapsed() };
    logger.error("Health check: database failed", {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const geminiTimer = startTimer();
  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY");
    if (!geminiKey || geminiKey.trim().length === 0) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    checks.gemini_api = { status: "ok", duration_ms: geminiTimer.elapsed() };
  } catch (err) {
    allHealthy = false;
    checks.gemini_api = { status: "error", duration_ms: geminiTimer.elapsed() };
    logger.warn("Health check: Gemini API key missing", {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const status = allHealthy ? "healthy" : "degraded";
  const httpStatus = allHealthy ? 200 : 503;

  const body = {
    status,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    checks,
    uptime_ms: Date.now() - BOOT_TIME,
    response_time_ms: overall.elapsed(),
  };

  logger.info("Health check completed", {
    requestId,
    status,
    duration_ms: overall.elapsed(),
  });

  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
