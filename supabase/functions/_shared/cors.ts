// supabase/functions/_shared/cors.ts
//
// Shared CORS contract for every browser-facing Supabase Edge Function.
//
// SECURITY PURPOSE:
// - Allow only trusted browser origins (never wildcard + credentials)
// - Handle OPTIONS before authentication / business logic
// - Attach CORS + correlation IDs to every response path, including errors
// - Keep CORS as a browser access control, not an authentication substitute
//
// HOW TO CONFIGURE:
//
// ALLOWED_ORIGINS — comma-separated explicit origins
//   https://trycareerpilot.com,https://www.trycareerpilot.com,https://clarify.ai.sltfinanceindia.com
//
// ALLOW_LOCALHOST_ORIGINS — unset defaults false in production, true otherwise
// ALLOW_PREVIEW_ORIGINS — unset defaults false in production, true otherwise
//   (Lovable preview hosts). Never leave this true on the live Edge project.
// ALLOW_ELECTRON_NULL_ORIGIN — "true" (default) or "false" (file:// Electron).
//   Unset env is treated as true. Secret sync also defaults this secret to "true"
//   when local env does not set a usable value.
// APP_ENV / ENVIRONMENT / DENO_ENV — production vs non-production labels

export type CorsEnvReader = {
  get(key: string): string | undefined;
};

const DEFAULT_ENV: CorsEnvReader = {
  get(key: string): string | undefined {
    try {
      const deno = (globalThis as {
        Deno?: { env?: { get?: (name: string) => string | undefined } };
      }).Deno;
      return deno?.env?.get?.(key);
    } catch {
      return undefined;
    }
  },
};

let envReader: CorsEnvReader = DEFAULT_ENV;
let cachedOrigins: Set<string> | null = null;
let cachedOriginKey: string | null = null;
let serveGuardInstalled = false;

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:8080",

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
  "https://trycareerpilot.com",
  "https://www.trycareerpilot.com",
  "https://clarify.ai.sltfinanceindia.com",
  "https://clarityapp.ai",
  "https://www.clarityapp.ai",
  "https://app.clarityapp.ai",
];

/** Custom-protocol Electron shells (file:// uses Origin: null, handled separately). */
const KNOWN_ELECTRON_ORIGINS = [
  "app://.",
  "clarify-coach://.",
];

const PREVIEW_HOST_PATTERNS: RegExp[] = [
  /\.lovable\.app$/i,
  /\.lovable\.dev$/i,
  /\.lovableproject\.com$/i,
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
  "x-csrf-token",
  "idempotency-key",
  "x-idempotency-key",
  "stripe-signature",
  "x-request-id",
  "x-correlation-id",
  "x-ai-training-consent",
].join(", ");

const EXPOSE_HEADERS = [
  "x-request-id",
  "x-correlation-id",
  "x-error-code",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
].join(", ");

function readEnv(key: string): string {
  return (envReader.get(key) ?? "").trim();
}

function envFlag(key: string, defaultValue: boolean): boolean {
  const raw = readEnv(key).toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

function isProductionEnvironment(): boolean {
  const appEnv = readEnv("APP_ENV").toLowerCase();
  const environment = readEnv("ENVIRONMENT").toLowerCase();
  const denoEnv = readEnv("DENO_ENV").toLowerCase();

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
  if (!trimmed || !isValidOrigin(trimmed)) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function addOriginIfValid(origins: Set<string>, origin: string): void {
  const normalized = normalizeOrigin(origin);
  if (normalized) origins.add(normalized);
}

function originCacheKey(): string {
  return [
    readEnv("ALLOWED_ORIGINS"),
    readEnv("ALLOW_LOCALHOST_ORIGINS"),
    readEnv("ALLOW_PREVIEW_ORIGINS"),
    readEnv("ALLOW_ELECTRON_NULL_ORIGIN"),
    readEnv("APP_ENV"),
    readEnv("ENVIRONMENT"),
    readEnv("DENO_ENV"),
  ].join("|");
}

function getAllowedOrigins(): Set<string> {
  const key = originCacheKey();
  if (cachedOrigins && cachedOriginKey === key) {
    return cachedOrigins;
  }

  const origins = new Set<string>();
  const isProduction = isProductionEnvironment();

  if (envFlag("ALLOW_LOCALHOST_ORIGINS", !isProduction)) {
    for (const origin of LOCAL_DEV_ORIGINS) {
      addOriginIfValid(origins, origin);
    }
  }

  if (isProduction) {
    for (const origin of KNOWN_PRODUCTION_ORIGINS) {
      addOriginIfValid(origins, origin);
    }
  }

  for (const origin of KNOWN_ELECTRON_ORIGINS) {
    origins.add(origin);
  }

  const configured = readEnv("ALLOWED_ORIGINS");
  if (configured.length > 0) {
    for (const origin of configured.split(",")) {
      addOriginIfValid(origins, origin);
    }
  } else if (isProduction) {
    console.error(
      "[cors] ALLOWED_ORIGINS secret not set in production. " +
        "Non-localhost browser origins outside the known production list will be rejected. " +
        "Set ALLOWED_ORIGINS in Supabase Dashboard → Edge Functions → Secrets.",
    );
  } else {
    console.warn(
      "[cors] ALLOWED_ORIGINS not set — only localhost / configured preview origins are allowed.",
    );
  }

  cachedOrigins = origins;
  cachedOriginKey = key;
  return origins;
}

function getRequestOrigin(req: Request): string | null {
  const rawOrigin = req.headers.get("origin") ?? req.headers.get("Origin");
  if (!rawOrigin) return null;
  if (rawOrigin.trim() === "null") return "null";
  return normalizeOrigin(rawOrigin);
}

function isPreviewOrigin(origin: string): boolean {
  if (!envFlag("ALLOW_PREVIEW_ORIGINS", !isProductionEnvironment())) return false;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    return PREVIEW_HOST_PATTERNS.some((re) => re.test(hostname));
  } catch {
    return false;
  }
}

function isOriginAllowedForCors(requestOrigin: string | null): boolean {
  if (!requestOrigin) return true;
  if (requestOrigin === "null") {
    return envFlag("ALLOW_ELECTRON_NULL_ORIGIN", true);
  }
  if (getAllowedOrigins().has(requestOrigin)) return true;
  if (isPreviewOrigin(requestOrigin)) return true;
  return false;
}

export function isOriginAllowed(req: Request): boolean {
  return isOriginAllowedForCors(getRequestOrigin(req));
}

export function resolveCorrelationId(req: Request): string {
  const fromHeader =
    req.headers.get("x-request-id")?.trim() ||
    req.headers.get("x-correlation-id")?.trim();
  if (fromHeader && fromHeader.length > 0 && fromHeader.length <= 128) {
    return fromHeader;
  }
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function functionNameFromRequest(req: Request): string {
  try {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "edge-function";
  } catch {
    return "edge-function";
  }
}

/**
 * Returns CORS headers for a given request.
 * Credentialed requests never receive Access-Control-Allow-Origin: *.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const requestOrigin = getRequestOrigin(req);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": EXPOSE_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (requestOrigin === "null" && isOriginAllowedForCors("null")) {
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
        success: false,
        error: "Origin not allowed.",
        code: "ORIGIN_NOT_ALLOWED",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Vary: "Origin",
        },
      },
    );
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}

function mergeHeaders(target: Headers, source: Record<string, string>): void {
  for (const [key, value] of Object.entries(source)) {
    target.set(key, value);
  }
}

/**
 * Adds CORS, security, and correlation headers to an existing response.
 * Safe to call more than once.
 */
export function applyCors(
  req: Request,
  response: Response,
  correlationId?: string,
): Response {
  const headers = new Headers(response.headers);
  mergeHeaders(headers, getCorsHeaders(req));

  const cid = correlationId ?? resolveCorrelationId(req);
  headers.set("x-request-id", headers.get("x-request-id") || cid);
  headers.set("x-correlation-id", headers.get("x-correlation-id") || cid);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", headers.get("Cache-Control") ?? "no-store");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Adds CORS headers to an existing response.
 */
export function withCorsHeaders(req: Request, response: Response): Response {
  return applyCors(req, response);
}

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
    headers["Access-Control-Expose-Headers"] = EXPOSE_HEADERS;
    headers["Access-Control-Max-Age"] = "86400";
    if (origin !== "null") {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }

  return headers;
}

export function withSecurityHeaders(req: Request, response: Response): Response {
  const wrapped = applyCors(req, response);
  const headers = new Headers(wrapped.headers);
  const extra = securityHeaders(getRequestOrigin(req) ?? undefined);
  mergeHeaders(headers, extra);
  headers.set("Vary", "Origin");
  return new Response(wrapped.body, {
    status: wrapped.status,
    statusText: wrapped.statusText,
    headers,
  });
}

export function corsJson(
  req: Request,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  const correlationId = resolveCorrelationId(req);
  return applyCors(
    req,
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...extraHeaders,
      },
    }),
    correlationId,
  );
}

export function corsSuccess(
  req: Request,
  data: unknown,
  status = 200,
): Response {
  const correlationId = resolveCorrelationId(req);
  return corsJson(req, status, {
    success: true,
    data,
    correlation_id: correlationId,
    correlationId,
  });
}

/** Expected business conflict (inventory, credits, submission, idempotency). */
export class BusinessError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BusinessError";
    this.status = status;
    this.code = code;
  }
}

function safePublicErrorCode(code: string): string {
  const trimmed = String(code ?? "").trim().slice(0, 64);
  if (!trimmed) return "ERROR";
  return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : "ERROR";
}

function observabilityLevel(status: number): "info" | "warn" | "error" {
  if (status === 409 || status === 402) return "info";
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

function logBrowserCorsOutcome(fields: {
  functionName: string;
  correlation_id: string;
  status: number;
  duration_ms: number;
  code?: string;
}): void {
  const level = observabilityLevel(fields.status);
  const payload: Record<string, unknown> = {
    level,
    functionName: fields.functionName,
    correlation_id: fields.correlation_id,
    status: fields.status,
    duration_ms: fields.duration_ms,
  };
  if (fields.code) payload.code = fields.code;
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function corsError(
  req: Request,
  status: number,
  code: string,
  message: string,
): Response {
  const correlationId = resolveCorrelationId(req);
  return corsJson(
    req,
    status,
    {
      success: false,
      error: message,
      code,
      correlation_id: correlationId,
      correlationId,
    },
    { "x-error-code": safePublicErrorCode(code) },
  );
}

export function unexpectedErrorResponse(
  req: Request,
  functionName: string,
  error: unknown,
): Response {
  const correlationId = resolveCorrelationId(req);
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: "error",
      functionName,
      correlationId,
      name: err.name,
      message: err.message,
    }),
  );

  const looksLikeInfra =
    /fetch failed|network|timeout|temporar|unavailable|ECONNREFUSED|503|502/i.test(
      err.message,
    );

  return corsError(
    req,
    looksLikeInfra ? 503 : 500,
    looksLikeInfra ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
    looksLikeInfra
      ? "The service is temporarily unavailable. Please try again."
      : "Something went wrong. Please try again.",
  );
}

export function withBrowserCors(
  functionName: string,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const startedAt = Date.now();
    const correlationId = resolveCorrelationId(req);
    const name = functionName || functionNameFromRequest(req);

    const finish = (response: Response): Response => {
      const headerCode = response.headers.get("x-error-code")?.trim();
      logBrowserCorsOutcome({
        functionName: name,
        correlation_id: correlationId,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        code: headerCode || undefined,
      });
      return response;
    };

    try {
      const preflight = handleCors(req);
      if (preflight) {
        return finish(applyCors(req, preflight, correlationId));
      }
      const response = await handler(req);
      return finish(applyCors(req, response, correlationId));
    } catch (error) {
      if (error instanceof BusinessError) {
        return finish(corsError(req, error.status, error.code, error.message));
      }
      if (error instanceof Response) {
        return finish(applyCors(req, error, correlationId));
      }
      return finish(unexpectedErrorResponse(req, name, error));
    }
  };
}

type ServeHandler = (req: Request, info?: unknown) => Response | Promise<Response>;

function wrapServeHandler(handler: ServeHandler): ServeHandler {
  const wrapped = withBrowserCors("edge-function", (req) => handler(req));
  return (req: Request, _info?: unknown) => wrapped(req);
}

/**
 * Wraps Deno.serve so every Edge Function that imports this module gets the
 * shared CORS contract, including error / rate-limit / thrown-exception paths.
 */
export function installDenoServeCorsGuard(): void {
  if (serveGuardInstalled) return;
  const deno = (globalThis as {
    Deno?: {
      serve?: ((...args: unknown[]) => unknown) & { __clarifyCorsWrapped?: boolean };
    };
  }).Deno;
  if (!deno || typeof deno.serve !== "function") return;
  if (deno.serve.__clarifyCorsWrapped) {
    serveGuardInstalled = true;
    return;
  }

  const originalServe = deno.serve.bind(deno) as (...args: unknown[]) => unknown;
  const wrappedServe = ((...args: unknown[]) => {
    if (typeof args[0] === "function") {
      return originalServe(wrapServeHandler(args[0] as ServeHandler));
    }
    if (args.length >= 2 && typeof args[1] === "function") {
      return originalServe(args[0], wrapServeHandler(args[1] as ServeHandler));
    }
    return originalServe(...args);
  }) as typeof deno.serve;
  wrappedServe.__clarifyCorsWrapped = true;
  deno.serve = wrappedServe;
  serveGuardInstalled = true;
}

export function resetCorsCacheForTests(): void {
  cachedOrigins = null;
  cachedOriginKey = null;
}

export function setCorsEnvForTests(reader: CorsEnvReader): void {
  envReader = reader;
  resetCorsCacheForTests();
}

export function restoreCorsEnvForTests(): void {
  envReader = DEFAULT_ENV;
  resetCorsCacheForTests();
}

installDenoServeCorsGuard();
