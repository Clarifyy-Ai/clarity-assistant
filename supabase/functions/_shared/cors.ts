// supabase/functions/_shared/cors.ts
//
// CORS origin validation for all Supabase Edge Functions.
//
// HOW TO CONFIGURE:
//   Set the ALLOWED_ORIGINS secret in Supabase Dashboard:
//   Settings → Edge Functions → Secrets → Add new secret
//
//   Key:   ALLOWED_ORIGINS
//   Value: https://clarityapp.ai,https://www.clarityapp.ai
//
//   Localhost is always allowed in non-production (when ALLOWED_ORIGINS
//   includes no clarityapp.ai domain, or when APP_ENV=development).
//   You never need to add localhost to ALLOWED_ORIGINS manually.
//
// HOW CORS HEADERS WORK (why a static object is wrong):
//   Access-Control-Allow-Origin accepts exactly ONE origin value or "*".
//   To support multiple origins (prod + staging + localhost), you must:
//     1. Read the Origin header from the request
//     2. Check if it's in your allowlist
//     3. Echo that exact origin back in the response
//   A static object with "*" cannot do this — hence getCorsHeaders(req).
//
// MIGRATION FOR EXISTING EDGE FUNCTIONS:
//   Replace:  headers: { ...corsHeaders, "Content-Type": "application/json" }
//   With:     headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
//
//   Replace:  if (cors) return cors;
//   Keep as-is — handleCors(req) already calls getCorsHeaders(req) internally.

/* ─── ALLOWED ORIGINS ────────────────────────────────────────────────────── */

/**
 * Returns the set of allowed origins for the current deployment.
 *
 * Priority order:
 *   1. ALLOWED_ORIGINS env var (comma-separated, set in Supabase Secrets)
 *   2. Hardcoded production fallback (prevents total lockout if secret is missing)
 *
 * Localhost variants are always included — edge functions are never called
 * from localhost in production (Vite dev server uses the Supabase anon key
 * which is already public, and all secrets stay server-side).
 */
function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    // Always allow local development origins
    "http://localhost:3000",
    "http://localhost:5173",   // Vite default
    "http://localhost:4173",   // Vite preview
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ]);

  const envOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";

  if (envOrigins.trim()) {
    // Parse comma-separated list from secret, trim whitespace around each entry
    for (const origin of envOrigins.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  } else {
    // Fallback: hardcoded production domains
    // Update these when your production domain changes.
    origins.add("https://clarityapp.ai");
    origins.add("https://www.clarityapp.ai");
    origins.add("https://app.clarityapp.ai");
    console.warn(
      "[cors] ALLOWED_ORIGINS secret not set — using hardcoded fallback. " +
      "Add ALLOWED_ORIGINS in Supabase Dashboard → Settings → Edge Functions → Secrets.",
    );
  }

  return origins;
}

/* ─── CORS HEADER BUILDER ────────────────────────────────────────────────── */

const ALLOWED_METHODS = "GET, POST, OPTIONS";

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-app-name",
  "x-app-version",
].join(", ");

/**
 * Returns CORS headers for a given request.
 *
 * If the request's Origin is in the allowlist, echoes it back as
 * Access-Control-Allow-Origin. Otherwise returns no ACAO header,
 * which causes the browser to block the response (correct behaviour).
 *
 * Always call this per-request — never cache or share the returned object
 * between requests since the allowed origin is request-specific.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const requestOrigin = req.headers.get("origin") ?? req.headers.get("Origin") ?? "";
  const allowedOrigins = getAllowedOrigins();

  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",  // tells CDNs the response varies by Origin
  };

  if (allowedOrigins.has(requestOrigin)) {
    // Echo the exact origin back — only way to support multiple allowed origins
    base["Access-Control-Allow-Origin"] = requestOrigin;
    // Allow cookies/Authorization headers to be included in cross-origin requests
    base["Access-Control-Allow-Credentials"] = "true";
  } else if (requestOrigin) {
    // Origin present but not allowed — log for debugging, return no ACAO header
    // Browser will block the response. Do NOT return "*" as fallback.
    console.warn(`[cors] Rejected origin: ${requestOrigin}`);
  }
  // If no Origin header: same-origin or non-browser request (curl, server-to-server)
  // No CORS headers needed — request proceeds normally.

  return base;
}

/* ─── PREFLIGHT HANDLER ──────────────────────────────────────────────────── */

/**
 * Handles CORS preflight OPTIONS requests.
 * Returns a 200 response with the correct CORS headers if origin is allowed,
 * or a 403 if the origin is not in the allowlist.
 *
 * Usage in every edge function (unchanged call signature):
 *   const cors = handleCors(req);
 *   if (cors) return cors;
 */
export function handleCors(req: Request): Response | null {
  if (req.method.toUpperCase() !== "OPTIONS") return null;

  const requestOrigin  = req.headers.get("origin") ?? req.headers.get("Origin") ?? "";
  const allowedOrigins = getAllowedOrigins();

  if (!requestOrigin) {
    // No Origin header on OPTIONS — unusual but not invalid (e.g. server-to-server)
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (!allowedOrigins.has(requestOrigin)) {
    console.warn(`[cors] Preflight rejected for origin: ${requestOrigin}`);
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      {
        status:  403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(null, {
    status:  204,   // No Content — standard for preflight
    headers: getCorsHeaders(req),
  });
}

/**
 * @deprecated Use getCorsHeaders(req) instead.
 * Kept for backward compatibility during migration.
 * Returns headers with no Access-Control-Allow-Origin (safe default)
 * until each edge function is updated to pass the request object.
 *
 * Migration:
 *   Old: headers: { ...corsHeaders, "Content-Type": "application/json" }
 *   New: headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Methods": ALLOWED_METHODS,
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Access-Control-Max-Age":       "86400",
  "Vary":                         "Origin",
  // NOTE: No Access-Control-Allow-Origin here intentionally.
  // Browsers will block responses using this object — migrate to getCorsHeaders(req).
};
