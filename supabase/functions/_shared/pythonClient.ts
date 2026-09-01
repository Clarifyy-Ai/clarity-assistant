/**
 * Edge → Python HMAC client for the hybrid backend.
 *
 * Env (Supabase Dashboard → Edge Functions → Secrets):
 * - PYTHON_SERVICE_URL or SCRAPER_URL — FastAPI base URL (no trailing slash)
 * - DOCUMENT_INTELLIGENCE_AUTH_SECRET or PYTHON_SERVICE_AUTH_SECRET — HMAC secret
 * - PYTHON_REQUEST_TIMEOUT_MS — default 25000
 * - PYTHON_LIVE_TIMEOUT_MS — overlay hint/answer fallback (default 5000)
 * - HYBRID_FORCE_PYTHON_UNAVAILABLE=1 — failure simulation
 *
 * Auth headers (match scraper/app/core/internal_auth.py):
 * - X-Internal-Timestamp
 * - X-Request-ID
 * - X-Internal-Signature: sha256=<hex>
 *
 * Message: METHOD\nPATH\nTIMESTAMP\nREQUEST_ID\nSHA256(body)
 */

import {
  classifyPythonFailure,
  DomainError,
  type DomainErrorCode,
} from "./domainErrors.ts";

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_LIVE_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RETRIES = 1;

/** Legacy alias union — routes via V1_PROCESS_OPERATION or mapPythonOperationType. */
export type PythonOperation =
  | "document_extract"
  | "document_classify"
  | "star_evidence"
  | "star_format"
  | "system_design"
  | "system_design_outline"
  | "practice_coach"
  | "practice_coach_hint"
  | "company_normalize"
  | "company_research_skeleton"
  | "mock_question_validate"
  | "mock_question_bank"
  | "resume_structure"
  | "ping"
  | "speech_process"
  | string;

export type PythonFetchOptions = {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  /** When true, retry once on network/5xx for safe/idempotent ops only. */
  safeRetry?: boolean;
  requestId?: string;
  headers?: Record<string, string>;
};

export type PythonFetchResult = {
  ok: boolean;
  status: number;
  json: unknown;
  latencyMs: number;
  requestId: string;
  errorCode?: DomainErrorCode;
  errorMessage?: string;
};

export type CallPythonProcessResult =
  | { ok: true; data: unknown; source: "python"; operationId: string }
  | { ok: false; code: string; retryable: boolean; message: string };

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** Overlay hint/answer Python fallback — fail fast to deterministic templates. */
export function livePythonTimeoutMs(): number {
  return Math.min(
    Math.max(1_000, envInt("PYTHON_LIVE_TIMEOUT_MS", DEFAULT_LIVE_TIMEOUT_MS)),
    25_000,
  );
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(digest);
}

/** Same WebCrypto HMAC pattern as razorpayFulfill.hmacSha256Hex. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(sig);
}

function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `py_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function normalizePath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

/** Canonical HMAC message shared with pythonGovExamClient and FastAPI internal_auth. */
export function canonicalInternalAuthMessage(
  method: string,
  path: string,
  timestamp: string,
  requestId: string,
  bodyDigest: string,
): string {
  return [method.toUpperCase(), normalizePath(path), timestamp, requestId, bodyDigest].join("\n");
}

function getAuthSecret(): string | null {
  const secret = (
    Deno.env.get("DOCUMENT_INTELLIGENCE_AUTH_SECRET") ??
    Deno.env.get("PYTHON_SERVICE_AUTH_SECRET") ??
    ""
  ).trim();
  return secret || null;
}

/**
 * Returns PYTHON_SERVICE_URL or SCRAPER_URL with trailing slash stripped, or null.
 */
export function getPythonServiceUrl(): string | null {
  const raw = (
    Deno.env.get("PYTHON_SERVICE_URL") ??
    Deno.env.get("SCRAPER_URL") ??
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

export function isPythonConfigured(): boolean {
  return Boolean(getPythonServiceUrl() && getAuthSecret());
}

export function isPythonForceUnavailable(): boolean {
  const flag = (Deno.env.get("HYBRID_FORCE_PYTHON_UNAVAILABLE") ?? "").trim();
  return flag === "1" || flag.toLowerCase() === "true";
}

/**
 * Build HMAC auth headers for an internal Python request.
 * `path` must be the URL pathname only (e.g. /v1/process).
 */
export async function signInternalRequest(
  method: string,
  path: string,
  bodyBytes: Uint8Array,
  requestId: string,
): Promise<Record<string, string>> {
  const secret = getAuthSecret();
  if (!secret) {
    throw new DomainError(
      "PYTHON_SERVICE_UNAVAILABLE",
      "Python internal auth secret is not configured.",
    );
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyDigest = await sha256Hex(bodyBytes);
  const message = canonicalInternalAuthMessage(
    method,
    path,
    timestamp,
    requestId,
    bodyDigest,
  );
  const signature = await hmacSha256Hex(secret, message);

  return {
    "X-Internal-Timestamp": timestamp,
    "X-Request-ID": requestId,
    "X-Internal-Signature": `sha256=${signature}`,
  };
}

function logEdge(phase: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      phase,
      ...fields,
    }),
  );
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

function isUnavailableStatus(status: number): boolean {
  return status === 0 || status === 502 || status === 503 || status === 504;
}

/**
 * Signed fetch to the Python service with bounded timeout and optional safe retry.
 */
export async function pythonFetch(
  path: string,
  options: PythonFetchOptions = {},
): Promise<PythonFetchResult> {
  const requestId = options.requestId?.trim() || newRequestId();
  const method = (options.method ?? (options.body !== undefined ? "POST" : "GET")).toUpperCase();
  const normalizedPath = normalizePath(path);
  const timeoutMs = Math.min(
    options.timeoutMs ?? envInt("PYTHON_REQUEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    120_000,
  );
  const maxRetries = options.safeRetry
    ? Math.min(envInt("PYTHON_MAX_RETRIES", DEFAULT_MAX_RETRIES), 1)
    : 0;

  if (isPythonForceUnavailable()) {
    logEdge("PYTHON_DISPATCH", {
      requestId,
      path: normalizedPath,
      method,
      skipped: "HYBRID_FORCE_PYTHON_UNAVAILABLE",
    });
    return {
      ok: false,
      status: 503,
      json: null,
      latencyMs: 0,
      requestId,
      errorCode: "PYTHON_SERVICE_UNAVAILABLE",
      errorMessage: "Python service force-unavailable flag is set.",
    };
  }

  const base = getPythonServiceUrl();
  if (!base || !isPythonConfigured()) {
    logEdge("EDGE_REQUEST", {
      requestId,
      path: normalizedPath,
      configured: false,
    });
    return {
      ok: false,
      status: 503,
      json: null,
      latencyMs: 0,
      requestId,
      errorCode: "PYTHON_SERVICE_UNAVAILABLE",
      errorMessage:
        "PYTHON_SERVICE_URL/SCRAPER_URL or DOCUMENT_INTELLIGENCE_AUTH_SECRET is not configured.",
    };
  }

  const bodyBytes =
    options.body === undefined || options.body === null
      ? new Uint8Array()
      : typeof options.body === "string"
      ? new TextEncoder().encode(options.body)
      : new TextEncoder().encode(JSON.stringify(options.body));

  logEdge("EDGE_REQUEST", {
    requestId,
    path: normalizedPath,
    method,
    bodyBytes: bodyBytes.byteLength,
    timeoutMs,
    safeRetry: Boolean(options.safeRetry),
  });

  const totalAttempts = 1 + (options.safeRetry ? maxRetries : 0);
  let attempt = 0;
  let last: PythonFetchResult | null = null;

  while (attempt < totalAttempts) {
    attempt += 1;
    const started = Date.now();
    const authHeaders = await signInternalRequest(
      method,
      normalizedPath,
      bodyBytes,
      requestId,
    );

    logEdge("PYTHON_DISPATCH", {
      requestId,
      path: normalizedPath,
      method,
      attempt,
    });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(`${base}${normalizedPath}`, {
        method,
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...authHeaders,
          ...(options.headers ?? {}),
        },
        body: method === "GET" || method === "HEAD" ? undefined : bodyBytes,
      });

      const json = await parseJsonSafe(res);
      const latencyMs = Date.now() - started;
      last = {
        ok: res.ok,
        status: res.status,
        json,
        latencyMs,
        requestId,
        errorCode: res.ok
          ? undefined
          : classifyPythonFailure(undefined, res.status),
        errorMessage: res.ok
          ? undefined
          : `Python responded with HTTP ${res.status}`,
      };

      logEdge("PYTHON_RESPONSE", {
        requestId,
        path: normalizedPath,
        status: res.status,
        ok: res.ok,
        latencyMs,
        attempt,
      });

      if (res.ok) return last;
      if (!options.safeRetry || attempt >= totalAttempts) return last;
      if (res.status < 500 && res.status !== 408 && res.status !== 429) return last;
    } catch (err) {
      const latencyMs = Date.now() - started;
      const isAbort = err instanceof Error && err.name === "AbortError";
      const code = classifyPythonFailure(err);
      last = {
        ok: false,
        status: 0,
        json: null,
        latencyMs,
        requestId,
        errorCode: code,
        errorMessage: isAbort
          ? `Python request timed out after ${timeoutMs}ms`
          : err instanceof Error
          ? err.message
          : String(err),
      };

      logEdge("PYTHON_RESPONSE", {
        requestId,
        path: normalizedPath,
        status: 0,
        ok: false,
        latencyMs,
        attempt,
        errorCode: code,
      });

      if (!options.safeRetry || attempt >= totalAttempts) return last;
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    last ?? {
      ok: false,
      status: 0,
      json: null,
      latencyMs: 0,
      requestId,
      errorCode: "PYTHON_SERVICE_UNAVAILABLE",
      errorMessage: "Python request failed.",
    }
  );
}

/**
 * Public liveness probe — no HMAC (Render healthCheckPath / Edge diagnostics).
 */
export async function pythonHealth(): Promise<PythonFetchResult> {
  return pythonPublicGet("/health", true);
}

/**
 * Public readiness probe — no HMAC.
 */
export async function pythonReady(): Promise<PythonFetchResult> {
  return pythonPublicGet("/ready", true);
}

async function pythonPublicGet(
  path: string,
  safeRetry: boolean,
): Promise<PythonFetchResult> {
  const requestId = newRequestId();
  const normalizedPath = normalizePath(path);
  const timeoutMs = Math.min(
    envInt("PYTHON_REQUEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    30_000,
  );

  if (isPythonForceUnavailable()) {
    return {
      ok: false,
      status: 503,
      json: null,
      latencyMs: 0,
      requestId,
      errorCode: "PYTHON_SERVICE_UNAVAILABLE",
      errorMessage: "Python service force-unavailable flag is set.",
    };
  }

  const base = getPythonServiceUrl();
  if (!base) {
    return {
      ok: false,
      status: 503,
      json: null,
      latencyMs: 0,
      requestId,
      errorCode: "PYTHON_SERVICE_UNAVAILABLE",
      errorMessage: "PYTHON_SERVICE_URL/SCRAPER_URL is not configured.",
    };
  }

  logEdge("EDGE_REQUEST", { requestId, path: normalizedPath, method: "GET", public: true });

  const totalAttempts = safeRetry ? 2 : 1;
  let last: PythonFetchResult | null = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const started = Date.now();
    logEdge("PYTHON_DISPATCH", { requestId, path: normalizedPath, method: "GET", attempt });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${normalizedPath}`, {
        method: "GET",
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      const json = await parseJsonSafe(res);
      const latencyMs = Date.now() - started;
      last = {
        ok: res.ok,
        status: res.status,
        json,
        latencyMs,
        requestId,
        errorCode: res.ok ? undefined : classifyPythonFailure(undefined, res.status),
        errorMessage: res.ok ? undefined : `Python responded with HTTP ${res.status}`,
      };
      logEdge("PYTHON_RESPONSE", {
        requestId,
        path: normalizedPath,
        status: res.status,
        ok: res.ok,
        latencyMs,
        attempt,
      });
      if (res.ok || !safeRetry || attempt >= totalAttempts) return last;
      if (res.status < 500 && res.status !== 408 && res.status !== 429) return last;
    } catch (err) {
      const latencyMs = Date.now() - started;
      const code = classifyPythonFailure(err);
      last = {
        ok: false,
        status: 0,
        json: null,
        latencyMs,
        requestId,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
      logEdge("PYTHON_RESPONSE", {
        requestId,
        path: normalizedPath,
        status: 0,
        ok: false,
        latencyMs,
        attempt,
        errorCode: code,
      });
      if (!safeRetry || attempt >= totalAttempts) return last;
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    last ?? {
      ok: false,
      status: 0,
      json: null,
      latencyMs: 0,
      requestId,
      errorCode: "PYTHON_SERVICE_UNAVAILABLE",
      errorMessage: "Python health request failed.",
    }
  );
}

/**
 * Engine-backed ops — POST /v1/process only (scraper/app/routes/process.py).
 * Never route these through /internal/operations scaffold handlers.
 */
const V1_PROCESS_OPERATION: Record<string, PythonOperation> = {
  practice_coach: "practice_coach",
  practice_coach_help: "practice_coach",
  live_answer: "practice_coach",
  speech_process: "speech_process",
  sprint_review_transcript: "speech_process",
  document_extract: "document_extract",
  document_classify: "document_classify",
  star_evidence: "star_evidence",
  system_design: "system_design",
  company_normalize: "company_normalize",
  mock_question_validate: "mock_question_validate",
};

/**
 * Edge hybrid ids → /internal/operations operation_type
 * (must stay aligned with scraper/app/hybrid/__init__.py SUPPORTED_OPERATIONS).
 *
 * Coach chat/hint/answer MUST NOT map to scaffold-only practice_coach_hint —
 * user-facing coach uses V1_PROCESS_OPERATION → /v1/process practice_coach.
 * speech_process / sprint_review_transcript are V1-only (not internal aliases).
 */
const OPERATION_TYPE_MAP: Record<string, string> = {
  star_builder: "star_format",
  system_design: "system_design_outline",
  resume_parse: "resume_structure",
  document_process: "document_extract",
  company_research: "company_research_skeleton",
  mock_question_generation: "mock_question_bank",
  ping: "ping",
  star_format: "star_format",
  system_design_outline: "system_design_outline",
  resume_structure: "resume_structure",
  document_extract: "document_extract",
  company_research_skeleton: "company_research_skeleton",
  mock_question_bank: "mock_question_bank",
  // Diagnostic scaffold only — hybrid-ping / internal smoke; not user coach success.
  practice_coach_hint: "practice_coach_hint",
  gap_analysis: "gap_analysis",
  session_debrief: "session_debrief",
  session_scorecard: "session_scorecard",
  analyze_test: "analyze_test",
  prep_rephrase: "prep_rephrase",
  prep_coding: "prep_coding",
  prep_project: "prep_project",
};

function isUserFacingCoachPayload(payload: Record<string, unknown>): boolean {
  return Boolean(
    payload.operation_type ||
      payload.question ||
      payload.message ||
      payload.transcript ||
      payload.questionText,
  );
}

function resolveV1ProcessOperation(rawOperation: string): PythonOperation | null {
  const key = String(rawOperation ?? "").trim();
  return V1_PROCESS_OPERATION[key] ?? null;
}

export function mapPythonOperationType(operation: string): string {
  const key = String(operation ?? "").trim();
  if (resolveV1ProcessOperation(key)) {
    return key;
  }
  return OPERATION_TYPE_MAP[key] ?? key;
}

async function dispatchV1ProcessOperation(
  rawOperation: string,
  operationId: string,
  correlationId: string,
  payload: Record<string, unknown>,
  timeoutMs?: number,
): Promise<PythonFetchResult> {
  const processOp = resolveV1ProcessOperation(rawOperation);
  if (!processOp) {
    return {
      ok: false,
      status: 422,
      json: {
        success: false,
        code: "UNSUPPORTED_OPERATION",
        message: `Operation ${rawOperation} is not routed to /v1/process.`,
      },
      latencyMs: 0,
      requestId: correlationId,
      errorCode: "PYTHON_PROCESSING_FAILED",
      errorMessage: `Operation ${rawOperation} is not routed to /v1/process.`,
    };
  }

  const processResult = await callPythonProcess({
    operation: processOp,
    operationId,
    correlationId,
    payload,
    timeoutMs,
  });

  if (processResult.ok) {
    return {
      ok: true,
      status: 200,
      json: { success: true, data: processResult.data, source: "python" },
      latencyMs: 0,
      requestId: correlationId,
    };
  }

  return {
    ok: false,
    status: processResult.retryable ? 503 : 422,
    json: {
      success: false,
      code: processResult.code,
      message: processResult.message,
      retryable: processResult.retryable,
    },
    latencyMs: 0,
    requestId: correlationId,
    errorCode: normalizePythonDomainCode(processResult.code),
    errorMessage: processResult.message,
  };
}

export type PythonOperationPayload = {
  /** Edge hybrid operation id or Python operation_type. */
  operation: string;
  operation_id?: string;
  correlation_id?: string;
  user_id?: string;
  user_context_hash?: string | null;
  input?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  idempotency_key?: string | null;
  [key: string]: unknown;
};

async function hashUserContext(userId?: string): Promise<string | null> {
  if (!userId) return null;
  const digest = await sha256Hex(new TextEncoder().encode(userId));
  return digest.slice(0, 32);
}

/**
 * POST /internal/operations — primary Edge → Python hybrid path.
 * Body matches scraper OperationRequest (operation_type, operation_id, …).
 */
export async function pythonExecuteOperation(
  payload: PythonOperationPayload,
  options?: { timeoutMs?: number; requestId?: string },
): Promise<PythonFetchResult> {
  const correlationId =
    (typeof payload.correlation_id === "string" && payload.correlation_id) ||
    options?.requestId ||
    newRequestId();
  const operationId =
    (typeof payload.operation_id === "string" && payload.operation_id) ||
    newRequestId();
  const rawOperation = String(payload.operation ?? "").trim();
  const bodyPayload =
    (payload.payload && typeof payload.payload === "object"
      ? payload.payload
      : null) ??
    (payload.input && typeof payload.input === "object" ? payload.input : {}) ??
    {};

  const typedPayload = bodyPayload as Record<string, unknown>;

  // Never accept scaffold-only practice_coach_hint for user coach payloads.
  if (
    rawOperation === "practice_coach_hint" &&
    isUserFacingCoachPayload(typedPayload)
  ) {
    return dispatchV1ProcessOperation(
      "practice_coach",
      operationId,
      correlationId,
      typedPayload,
      options?.timeoutMs,
    );
  }

  // Engine-backed ops — /v1/process (coach, speech, star_evidence, etc.).
  const v1Op = resolveV1ProcessOperation(rawOperation);
  if (v1Op) {
    return dispatchV1ProcessOperation(
      rawOperation,
      operationId,
      correlationId,
      typedPayload,
      options?.timeoutMs,
    );
  }

  const operationType = mapPythonOperationType(rawOperation);

  const body = {
    operation_type: operationType,
    operation_id: operationId,
    correlation_id: correlationId,
    user_context_hash:
      payload.user_context_hash ??
      (await hashUserContext(
        typeof payload.user_id === "string" ? payload.user_id : undefined,
      )),
    payload: bodyPayload,
    idempotency_key: payload.idempotency_key ?? null,
  };

  const result = await pythonFetch("/internal/operations", {
    method: "POST",
    body,
    timeoutMs: options?.timeoutMs,
    requestId: correlationId,
    safeRetry: false,
  });

  if (!result.ok && !result.errorCode) {
    result.errorCode = "PYTHON_SERVICE_UNAVAILABLE";
    result.errorMessage = result.errorMessage ?? "Python operation failed.";
  }

  // Surface Python structured failure codes when HTTP failed with JSON body.
  if (!result.ok && result.json && typeof result.json === "object") {
    const env = result.json as Record<string, unknown>;
    const nestedError =
      env.error && typeof env.error === "object"
        ? (env.error as Record<string, unknown>)
        : null;
    const rawCode =
      (typeof env.code === "string" && env.code) ||
      (nestedError && typeof nestedError.code === "string" && nestedError.code) ||
      "";
    if (rawCode) {
      result.errorCode = normalizePythonDomainCode(rawCode);
    }
    const rawMessage =
      (typeof env.message === "string" && env.message) ||
      (nestedError && typeof nestedError.message === "string" && nestedError.message) ||
      "";
    if (rawMessage) {
      result.errorMessage = rawMessage;
    }
  }

  return result;
}

/** Map Python structured codes into stable Edge domain codes. */
export function normalizePythonDomainCode(code: string): DomainErrorCode {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (
    normalized === "PYTHON_SERVICE_UNAVAILABLE" ||
    normalized === "PYTHON_PROCESSING_FAILED"
  ) {
    return normalized as DomainErrorCode;
  }
  if (
    normalized === "REQUEST_VALIDATION_FAILED" ||
    normalized === "UNSUPPORTED_OPERATION" ||
    normalized === "VALIDATION_ERROR" ||
    normalized === "BAD_REQUEST"
  ) {
    return "PYTHON_PROCESSING_FAILED";
  }
  if (
    normalized.includes("UNAVAILABLE") ||
    normalized.includes("TIMEOUT") ||
    normalized === "INTERNAL_PROCESSING_ERROR"
  ) {
    return "PYTHON_SERVICE_UNAVAILABLE";
  }
  return "PYTHON_PROCESSING_FAILED";
}

function extractProcessData(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if ("data" in obj) return obj.data;
  if ("result" in obj) return obj.result;
  return obj;
}

/**
 * POST `{base}/v1/process` for a hybrid operation.
 * At most 1 retry on network/5xx. Never infinite. Never throws.
 */
export async function callPythonProcess(opts: {
  operation: PythonOperation;
  operationId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<CallPythonProcessResult> {
  if (!isPythonConfigured() || isPythonForceUnavailable()) {
    console.log(
      `[python] dispatch operation=${opts.operation} correlation=${opts.correlationId} configured=false`,
    );
    return {
      ok: false,
      code: "PYTHON_SERVICE_UNAVAILABLE",
      retryable: false,
      message: "Python processing service is not configured.",
    };
  }

  const maxRetries = Math.min(
    Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES),
    1,
  );
  const timeoutMs = Math.min(
    opts.timeoutMs ?? envInt("PYTHON_REQUEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    120_000,
  );

  const body = {
    operation: opts.operation,
    operation_id: opts.operationId,
    correlation_id: opts.correlationId,
    payload: opts.payload,
    timestamp: new Date().toISOString(),
  };

  console.log(
    `[python] dispatch operation=${opts.operation} correlation=${opts.correlationId}`,
  );

  let lastFail: CallPythonProcessResult = {
    ok: false,
    code: "PYTHON_SERVICE_UNAVAILABLE",
    retryable: true,
    message: "Python processing service is temporarily unavailable.",
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await pythonFetch("/v1/process", {
      method: "POST",
      body,
      timeoutMs,
      requestId: opts.correlationId,
      safeRetry: false,
    });

    console.log(
      `[python] response operation=${opts.operation} correlation=${opts.correlationId} status=${result.status} ok=${result.ok} attempt=${attempt + 1}`,
    );

    if (result.ok) {
      const envelope = result.json as Record<string, unknown> | null;
      if (
        envelope &&
        typeof envelope === "object" &&
        envelope.success === false
      ) {
        const code = String(envelope.code ?? "PYTHON_PROCESSING_FAILED");
        return {
          ok: false,
          code,
          retryable: Boolean(envelope.retryable),
          message: String(
            envelope.message ?? envelope.error ?? "Python processing failed.",
          ),
        };
      }

      return {
        ok: true,
        data: extractProcessData(result.json),
        source: "python",
        operationId: opts.operationId,
      };
    }

    const unavailable = isUnavailableStatus(result.status);
    const code = unavailable
      ? "PYTHON_SERVICE_UNAVAILABLE"
      : result.errorCode ?? "PYTHON_PROCESSING_FAILED";
    lastFail = {
      ok: false,
      code,
      retryable: unavailable || result.status >= 500,
      message:
        result.errorMessage ??
        (unavailable
          ? "Python processing service is temporarily unavailable."
          : "Python processing failed."),
    };

    if (!lastFail.retryable || attempt >= maxRetries) break;
  }

  return lastFail;
}
