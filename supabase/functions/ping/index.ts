import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { logger, withRequestId } from "../_shared/logger.ts";
import { startTimer } from "../_shared/timing.ts";
import { resolveGeminiApiKey } from "../_shared/geminiKey.ts";

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

  // Public probe: liveness only. Never expose provider inventory.
  if (!hasServiceRoleAuth(req)) {
    return new Response(
      JSON.stringify({ status: "ok" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
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

  const aiTimer = startTimer();
  try {
    const anyAi = Boolean(
      resolveGeminiApiKey() ||
        (Deno.env.get("OPENAI_API_KEY") ?? "").trim() ||
        (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim(),
    );
    if (!anyAi) {
      throw new Error("No AI provider configured");
    }
    checks.ai_provider = { status: "ok", duration_ms: aiTimer.elapsed() };
  } catch {
    allHealthy = false;
    checks.ai_provider = { status: "error", duration_ms: aiTimer.elapsed() };
  }

  const billingTimer = startTimer();
  try {
    const { validateBillingConfig } = await import("../_shared/billingConfig.ts");
    const report = validateBillingConfig({
      requireStripe: false,
      requireRazorpay: Boolean(Deno.env.get("RAZORPAY_KEY_ID")),
    });
    checks.billing_config = {
      status: report.ok ? "ok" : "degraded",
      duration_ms: billingTimer.elapsed(),
    };
    if (!report.ok && (Deno.env.get("APP_ENV") ?? "") === "production") {
      allHealthy = false;
    }
  } catch {
    checks.billing_config = { status: "error", duration_ms: billingTimer.elapsed() };
  }

  const rlTimer = startTimer();
  try {
    const db = createServiceClient();
    const { error } = await db.rpc("check_rate_limit", {
      p_key: "__healthcheck__",
      p_limit: 1,
      p_window_ms: 60_000,
    });
    checks.rate_limit_rpc = {
      status: error ? "error" : "ok",
      duration_ms: rlTimer.elapsed(),
    };
    if (error) allHealthy = false;
  } catch {
    allHealthy = false;
    checks.rate_limit_rpc = { status: "error", duration_ms: rlTimer.elapsed() };
  }

  const adminAuth = await authenticateRequest(req).catch(() => null);
  if (adminAuth && !adminAuth.error && adminAuth.context) {
    const db = createServiceClient();
    const { data: isAdmin } = await db.rpc("is_admin");
    if (isAdmin) {
      await db.from("admin_audit_log").insert({
        admin_id: adminAuth.context.user.id,
        action: "health_diagnostics",
        target_type: "ping",
        new_value: { requestId },
      }).then(() => {}, () => {});
    }
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
