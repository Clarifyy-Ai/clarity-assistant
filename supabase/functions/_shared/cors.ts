// supabase/functions/_shared/cors.ts
//
// CORS origin validation for all Supabase Edge Functions.
//
// HOW TO CONFIGURE:
//   Set the ALLOWED_ORIGINS secret in Supabase Dashboard:
//   Settings → Edge Functions → Secrets → Add new secret
//
//   Key:   ALLOWED_ORIGINS
//   Value: https://clarify.ai.sltfinanceindia.com,https://clarityapp.ai,https://www.clarityapp.ai
//
//   Localhost is always allowed for local development.
//   You never need to add localhost to ALLOWED_ORIGINS manually.

/* ─── ALLOWED ORIGINS ────────────────────────────────────────────────────── */

let _cachedOrigins: Set<string> | null = null;

function getAllowedOrigins(): Set<string> {
  if (_cachedOrigins) return _cachedOrigins;

  const origins = new Set<string>([
    // Always allow local development origins
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ]);

  const envOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";

  if (envOrigins.trim()) {
    for (const origin of envOrigins.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  } else {
    // ── FALLBACK: hardcoded production domains ──────────────────────────
    // These are used when ALLOWED_ORIGINS secret is not yet configured.
    // Add your actual deployed domain here.
    origins.add("https://clarify.ai.sltfinanceindia.com"); // ← actual production domain
    origins.add("https://clarityapp.ai");
    origins.add("https://www.clarityapp.ai");
    origins.add("https://app.clarityapp.ai");
    console.warn(
      "[cors] ALLOWED_ORIGINS secret not set — using hardcoded fallback. " +
      "Add ALLOWED_ORIGINS in Supabase Dashboard → Settings → Edge Functions → Secrets.",
    );
  }

  _cachedOrigins = origins;
  return origins;
}

/* ─── CORS HEADER BUILDER ────────────────────────────────────────────────── */

// Added HEAD, PUT, DELETE — required for networkMonitor ping + REST operations
const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS, HEAD";

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
    "Vary":                         "Origin",
  };

  if (allowedOrigins.has(requestOrigin)) {
    base["Access-Control-Allow-Origin"] = requestOrigin;
    base["Access-Control-Allow-Credentials"] = "true";
  } else if (requestOrigin) {
    console.warn(`[cors] Rejected origin: ${requestOrigin}`);
  }

  return base;
}

/* ─── PREFLIGHT HANDLER ──────────────────────────────────────────────────── */

/**
 * Handles CORS preflight OPTIONS requests.
 *
 * Usage at the top of every edge function (unchanged):
 *   const cors = handleCors(req);
 *   if (cors) return cors;
 */
export function handleCors(req: Request): Response | null {
  if (req.method.toUpperCase() !== "OPTIONS") return null;

  const requestOrigin  = req.headers.get("origin") ?? req.headers.get("Origin") ?? "";
  const allowedOrigins = getAllowedOrigins();

  if (!requestOrigin) {
    // No Origin header on OPTIONS — server-to-server request, allow it
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
    status:  204,
    headers: getCorsHeaders(req),
  });
}
