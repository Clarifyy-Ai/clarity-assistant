// supabase/functions/_shared/cors.ts — PRODUCTION-READY

const DEV = Deno.env.get("ENV") === "dev";
const PROD_ORIGIN = Deno.env.get("PROD_ORIGIN") ?? "https://confideq.app";

const ALLOWED_ORIGIN = DEV ? "*" : PROD_ORIGIN;

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400" // 24h preflight cache
};

/**
 * Unified CORS handler
 * Returns a preflight response if needed, otherwise returns null
 */
export function handleCors(req: Request): Response | null {
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  return null;
}
