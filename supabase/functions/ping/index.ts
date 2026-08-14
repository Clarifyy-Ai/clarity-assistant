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

  // Public probe: status plus which AI providers are configured (booleans only).
  if (!hasServiceRoleAuth(req)) {
    const present = (key: string) => Boolean((Deno.env.get(key) ?? "").trim());
    return new Response(
      JSON.stringify({
        status: "ok",
        providers: {
          gemini: present("GEMINI_API_KEY") || present("GOOGLE_AI_API_KEY"),
          openai: present("OPENAI_API_KEY"),
          anthropic: present("ANTHROPIC_API_KEY"),
          deepgram: present("DEEPGRAM_API_KEY"),
        },
      }),
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

  const billingTimer = startTimer();
  try {
    const { validateBillingConfig } = await import("../_shared/billingConfig.ts");
    const report = validateBillingConfig({
      requireStripe: Boolean(Deno.env.get("STRIPE_SECRET_KEY")),
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
    // Missing RPC is a hard fail; soft errors still report degraded
    checks.rate_limit_rpc = {
      status: error ? "error" : "ok",
      duration_ms: rlTimer.elapsed(),
    };
    if (error) allHealthy = false;
  } catch {
    allHealthy = false;
    checks.rate_limit_rpc = { status: "error", duration_ms: rlTimer.elapsed() };
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
