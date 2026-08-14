// supabase/functions/_shared/cors.ts
//
// Shared CORS helpers for Supabase Edge Functions.
//
// SECURITY PURPOSE:
// - Allow only trusted browser origins
// - Support local development safely
// - Handle OPTIONS preflight consistently
// - Avoid wildcard CORS with credentials
// - Allow required app headers such as Authorization, CSRF, BYOK, and Idempotency-Key
//
// HOW TO CONFIGURE:
//
// Set the ALLOWED_ORIGINS secret in Supabase Dashboard:
//
// Settings → Edge Functions → Secrets → Add new secret
//
// Key:
// ALLOWED_ORIGINS
//
// Value example:
// https://clarify.ai.sltfinanceindia.com,https://clarityapp.ai,https://www.clarityapp.ai
//
// Localhost origins are allowed only in non-production environments.

function isProductionEnvironment(): boolean {
  const appEnv = (Deno.env.get("APP_ENV") ?? "").trim().toLowerCase();
  const environment = (Deno.env.get("ENVIRONMENT") ?? "").trim().toLowerCase();
  const denoEnv = (Deno.env.get("DENO_ENV") ?? "").trim().toLowerCase();

  const nonProdLabels = ["development", "dev", "local", "preview", "staging", "stage", "test"];
  if (
    nonProdLabels.includes(appEnv) ||
    nonProdLabels.includes(environment) ||
    ["development", "dev", "local", "test"].includes(denoEnv)
  ) {
    return false;
  }
  if (
    appEnv === "production" ||
    appEnv === "prod" ||
    environment === "production" ||
    environment === "prod" ||
    denoEnv === "production"
  ) {
    return true;
  }

  // Default fail-closed when unset (typical Supabase Edge runtime).
  return true;
}

const isProduction = isProductionEnvironment();

let cachedOrigins: Set<string> | null = null;
let cachedEnvString: string | null = null;

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5000",
  "http://localhost:5001",
  "http://localhost:5002",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5001",
  "http://127.0.0.1:5002",
  "http://127.0.0.1:5173",
];

/** Known production browser origins — merged even if ALLOWED_ORIGINS secret is missing. */
const KNOWN_PRODUCTION_ORIGINS = [
  "https://clarify.ai.sltfinanceindia.com",
  "https://clarityapp.ai",
  "https://www.clarityapp.ai",
  "https://app.clarityapp.ai",
];

const ALLOWED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
].join(", ");

const ALLOWED_HEADERS = [
  "authorization",
  "apikey",
  "content-type",
  "x-client-info",
  "x-app-name",
  "x-app-version",

  // CSRF protection from frontend apiClient.ts
  "x-csrf-token",

  // Idempotency for billing/credit/state-changing actions
  // Clients send both casings depending on the API helper.
  "idempotency-key",
  "x-idempotency-key",

  // Optional webhook/signature headers if helper is reused
  "stripe-signature",

  // Client correlation (fetchEdge / apiClient)
  "x-request-id",
  "x-correlation-id",
].join(", ");

function isValidOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeOrigin(origin: string): string | null {
  const trimmed = origin.trim();

  if (!trimmed || !isValidOrigin(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    // Normalize by removing trailing slash.
    return url.origin;
  } catch {
    return null;
  }
}

function addOriginIfValid(origins: Set<string>, origin: string): void {
  const normalized = normalizeOrigin(origin);

  if (normalized) {
    origins.add(normalized);
  }
}

function getAllowedOrigins(): Set<string> {
  const currentEnv = Deno.env.get("ALLOWED_ORIGINS") ?? "";

  if (cachedOrigins && cachedEnvString === currentEnv) {
    return cachedOrigins;
  }

  const origins = new Set<string>();

  // Loopback is always allowed. CORS is not auth — JWT is still required.
  // Remote Edge + local Vite (http://127.0.0.1:5000) is the closed-beta workflow.
  for (const origin of LOCAL_DEV_ORIGINS) {
    addOriginIfValid(origins, origin);
  }

  if (isProduction) {
    for (const origin of KNOWN_PRODUCTION_ORIGINS) {
      addOriginIfValid(origins, origin);
    }
  }

  if (currentEnv.trim().length > 0) {
    for (const origin of currentEnv.split(",")) {
      addOriginIfValid(origins, origin);
    }
  } else if (isProduction) {
    console.error(
      "[cors] ALLOWED_ORIGINS secret not set in production. " +
        "Non-localhost browser origins will be rejected. " +
        "Set ALLOWED_ORIGINS in Supabase Dashboard → Edge Functions → Secrets."
    );
  } else {
    console.warn(
      "[cors] ALLOWED_ORIGINS not set — only localhost dev origins are allowed."
    );
  }

  cachedOrigins = origins;
  cachedEnvString = currentEnv;

  return origins;
}

function getRequestOrigin(req: Request): string | null {
  const rawOrigin = req.headers.get("origin") ?? req.headers.get("Origin");

  if (!rawOrigin) {
    return null;
  }

  // Electron loadFile / opaque origins send the literal Origin: null
  if (rawOrigin.trim() === "null") {
    return "null";
  }

  return normalizeOrigin(rawOrigin);
}

/** Preview hosts used by Lovable / staging. CORS is not an auth boundary — JWT still required. */
const PREVIEW_HOST_PATTERNS: RegExp[] = [
  /\.lovable\.app$/i,
  /\.lovable\.dev$/i,
  /\.lovableproject\.com$/i,
];

function isPreviewOrigin(origin: string): boolean {
  if (PREVIEW_HOST_PATTERNS.length === 0) return false;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    return PREVIEW_HOST_PATTERNS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
}

function isOriginAllowedForCors(requestOrigin: string | null): boolean {
  if (!requestOrigin || requestOrigin === "null") return true;
  if (getAllowedOrigins().has(requestOrigin)) return true;
  if (isPreviewOrigin(requestOrigin)) return true;
  return false;
}

export function isOriginAllowed(req: Request): boolean {
  return isOriginAllowedForCors(getRequestOrigin(req));
}

/**
 * Returns CORS headers for a given request.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const requestOrigin = getRequestOrigin(req);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (requestOrigin === "null") {
    headers["Access-Control-Allow-Origin"] = "null";
  } else if (requestOrigin && isOriginAllowedForCors(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  if (requestOrigin && !isOriginAllowedForCors(requestOrigin)) {
    console.warn("[cors] Rejected origin:", requestOrigin);
  }

  return headers;
}

/**
 * Handles CORS preflight OPTIONS requests.
 *
 * Usage:
 *
 * const cors = handleCors(req);
 * if (cors) return cors;
 */
export function handleCors(req: Request): Response | null {
  if (req.method.toUpperCase() !== "OPTIONS") {
    return null;
  }

  const requestOrigin = getRequestOrigin(req);

  // No Origin header means non-browser/server-to-server request.
  if (!requestOrigin) {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req),
    });
  }

  if (!isOriginAllowedForCors(requestOrigin)) {
    console.warn("[cors] Preflight rejected for origin:", requestOrigin);

    return new Response(
      JSON.stringify({
        error: "Origin not allowed.",
        code: "ORIGIN_NOT_ALLOWED",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Vary": "Origin",
        },
      }
    );
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}

/**
 * Adds CORS headers to an existing response.
 *
 * Useful when shared helpers return Response objects without CORS headers.
 */
export function withCorsHeaders(req: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = getCorsHeaders(req);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Returns security headers that should be applied to all edge function responses.
 * Optionally includes CORS headers if origin is provided and allowed.
 */
export function securityHeaders(origin?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  };

  if (origin && isOriginAllowedForCors(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS;
    headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS;
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

/**
 * Wraps a Response with both CORS and security headers.
 * Preferred over withCorsHeaders for new code.
 */
export function withSecurityHeaders(req: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const requestOrigin = getRequestOrigin(req);
  const allHeaders = securityHeaders(requestOrigin ?? undefined);

  for (const [key, value] of Object.entries(allHeaders)) {
    headers.set(key, value);
  }

  headers.set("Vary", "Origin");
  if (requestOrigin && isOriginAllowedForCors(requestOrigin)) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
