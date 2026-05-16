// supabase/functions/_shared/cors.ts — PRODUCTION READY (ALL FIXES APPLIED)
//
// HOW TO CONFIGURE:
//   Set the ALLOWED_ORIGINS secret in Supabase Dashboard:
//   Settings → Edge Functions → Secrets → Add new secret
//
//   Key:   ALLOWED_ORIGINS
//   Value: https://clarify.ai.sltfinanceindia.com,https://clarityapp.ai,https://www.clarityapp.ai
//
//   Localhost is always allowed for local development.

/* ─── ALLOWED ORIGINS ────────────────────────────────────────────────────── */

// Cache + env-string tracking so we can invalidate cache when ALLOWED_ORIGINS changes.
let _cachedOrigins: Set<string> | null = null;
let _cachedEnvString: string | null = null;

function getAllowedOrigins(): Set<string> {
  const currentEnv = Deno.env.get("ALLOWED_ORIGINS") ?? "";

  // Invalidate cache if env var changed (helps in local dev)
  if (_cachedOrigins && _cachedEnvString === currentEnv) {
    return _cachedOrigins;
  }

  const origins = new Set<string>([
    // Always allow local development origins
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ]);

  if (currentEnv.trim()) {
    for (const origin of currentEnv.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  } else {
    // Fallback hardcoded production domains
    origins.add("https://clarify.ai.sltfinanceindia.com");
    origins.add("https://clarityapp.ai");
    origins.add("https://www.clarityapp.ai");
    origins.add("https://app.clarityapp.ai");
    console.warn(
      "[cors] ALLOWED_ORIGINS secret not set — using hardcoded fallback. " +
      "Add ALLOWED_ORIGINS in Supabase Dashboard → Settings → Edge Functions → Secrets " +
      "and redeploy to silence this warning."
    );
  }

  _cachedOrigins   = origins;
  _cachedEnvString = currentEnv;
  return origins;
}

/* ─── CORS HEADER BUILDER ────────────────────────────────────────────────── */

// Added HEAD, PATCH for network probes and REST operations.
const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH";

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-app-name",
  "x-app-version",
  // BYOK headers — must be allowed or browser will block preflight.
  "x-byok-openai",
  "x-byok-anthropic",
  "x-byok-gemini",
].join(", ");

/**
 * Returns CORS headers for a given request.
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
    base["Access-Control-Allow-Origin"]      = requestOrigin;
    base["Access-Control-Allow-Credentials"] = "true";
  } else if (requestOrigin) {
    console.warn(
      `[cors] Rejected origin: "${requestOrigin}". ` +
      `Add it to ALLOWED_ORIGINS secret if this is a valid domain.`
    );
  }

  return base;
}

/* ─── PREFLIGHT HANDLER ──────────────────────────────────────────────────── */

/**
 * Handles CORS preflight OPTIONS requests.
 *
 * Usage in every edge function:
 *   const cors = handleCors(req);
 *   if (cors) return cors;
 */
export function handleCors(req: Request): Response | null {
  if (req.method.toUpperCase() !== "OPTIONS") return null;

  const requestOrigin  = req.headers.get("origin") ?? req.headers.get("Origin") ?? "";
  const allowedOrigins = getAllowedOrigins();

  // No Origin header on OPTIONS — server-to-server request, allow it
  if (!requestOrigin) {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (!allowedOrigins.has(requestOrigin)) {
    console.warn(`[cors] Preflight rejected for origin: "${requestOrigin}"`);
    return new Response(
      JSON.stringify({ error: "Origin not allowed", origin: requestOrigin }),
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
