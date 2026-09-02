// src/lib/network/fetchEdge.ts
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { allowsAiTraining } from "@/lib/privacy/privacyPrefs";
import { getPrivateMode } from "@/hooks/usePrivateMode";
import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isTabLocalLogout } from "@/lib/auth/tabLocalLogout";
import { ApiClientError } from "@/lib/api/apiClient";
import { ensureAuthSession } from "@/lib/focusRecovery/sessionRefresh";
import { debugLog161d95 } from "@/lib/debug/debugLog161d95";
import { debugLog4a9592 } from "@/lib/debug/debugLog4a9592";
import { coalesceKey, resetSingleFlightForTests, singleFlight } from "@/lib/network/singleFlight";
import { createIdempotencyKey } from "@/lib/network/idempotency";
import { isExpectedBusinessFailure } from "@/lib/network/businessConflict";

export { resetSingleFlightForTests };

/** Functions that may run without a user JWT (gateway still gets apikey + anon Bearer). */
const ANON_OK_EDGE_FNS = new Set([
  "ping",
  "hybrid-health",
  "hybrid-ping",
  "ai-key-check",
  "billing-catalog",
  "contact-sales",
  // Public support/live-chat widget: guests chat without an account.
  "support-chat",

]);

/** Edge calls blocked while private mode is on (no cloud AI / analysis). */
const PRIVATE_MODE_ALLOWLIST = new Set([
  "ping",
  // Live Chat is hybrid support (account lookups first). Keep available in private mode.
  "support-chat",
  "razorpay-create-order",
  "razorpay-verify-payment",
  "record-referral",
  // GDPR data export is a data-rights operation, not cloud AI.
  "export-user-data",
  "moderate-content",
  // Admin ingest / diagnostics (no cloud AI generation).
  "hybrid-health",
  "hybrid-ping",
  "ai-key-check",
  "collect-exam-papers",
  "extract-question-paper",
  "run-daily-exam-scrape",
  // Learning Hub certificate / free course quiz start (no cloud AI).
  "issue-course-certificate",
  "create-test",
  "submit-test",
  "save-test-answer",
  "start-exam",
  "start-exam-attempt",
  "save-test-answer",
  "save-attempt-answer",
  "billing-catalog",
  "contact-sales",
  "hostinger-mail",
  "send-email",
]);

/** Edge functions that do not deduct credits — skip balance refresh. */
const CREDIT_REFRESH_SKIP = new Set([
  "ping",
  "billing-catalog",
  "contact-sales",
  "schedule-interview",
  "sync-calendar",
  "disconnect-calendar",
  "deepgram-token",
  "stripe-webhook",
  "create-checkout",
  "create-billing-portal",
  "razorpay-create-order",
  "ai-hub-router",
  "support-chat",
  "analytics-dashboard",
  "compare-sessions",
  "assemble-assessment",
  "start-session",
  "end-session",
  "hybrid-health",
  "hybrid-ping",
  "ai-key-check",
  "collect-exam-papers",
  "extract-question-paper",
  "run-daily-exam-scrape",
  "moderate-content",
  "process-sprint-transcript",
  // Read-only gov registry — never burns credits; avoid refresh storms on typeahead.
  "search-exams",
  "get-exam-details",
  "get-exam-pattern",
  "get-exam-syllabus",
  "list-previous-papers",
  "check-exam-paper-availability",
  "get-paper-generation-job",
  "cancel-paper-generation-job",
  "score-coding-submission",
  "issue-course-certificate",
  "submit-test",
  "save-attempt-answer",
  "save-test-answer",
  "start-exam-attempt",
  "start-exam",
  "hostinger-mail",
  "send-email",
]);

/** Non-AI functions should not blame an "AI request" on CORS / network failure. */
const OPERATIONAL_EDGE_FNS = new Set([
  "submit-test",
  "save-attempt-answer",
  "save-test-answer",
  "start-exam-attempt",
  "start-exam",
  "create-test",
  "create-exam-paper",
  "generate-topic-practice",
  "process-paper-generation-job",
  "select-test-questions",
  "get-exam-details",
  "search-exams",
  "list-previous-papers",
  "assemble-assessment",
  "ping",
  "create-checkout",
  "create-billing-portal",
  "razorpay-create-order",
  "razorpay-verify-payment",
  "record-referral",
  "analytics-dashboard",
  "compare-sessions",
  "start-session",
  "end-session",
  "export-user-data",
  "score-coding-submission",
  "hybrid-health",
  "hybrid-ping",
  "ai-key-check",
  "collect-exam-papers",
  "extract-question-paper",
  "run-daily-exam-scrape",
  "moderate-content",
  "issue-course-certificate",
  "sync-calendar",
  "disconnect-calendar",
  "hostinger-mail",
  "send-email",
]);

/** Mutating calls that must not be retried by the browser after a network/CORS glitch. */
const NO_NETWORK_RETRY_FNS = new Set([
  "submit-test",
  "create-exam-paper",
  "generate-topic-practice",
  "create-test",
  "assemble-assessment",
  "issue-course-certificate",
  "start-session",
  "end-session",
  "finalize-session",
  "deduct-credits",
  "generate-hint",
  "generate-questions",
  "generate-answer",
  "generate-scorecard",
  "generate-debrief",
  "generate-practice-questions",
  "generate-star-answer",
  "prep-tool",
  "polish-star-section",
  "parse-question-pdf",
  "parse-document",
  "parse-resume",
  "schedule-interview",
  "create-checkout",
  "create-billing-portal",
  "delete-account",
  "start-exam",
  "start-exam-attempt",
  "save-test-answer",
  "save-attempt-answer",
  "select-test-questions",
  "process-paper-generation-job",
  "cancel-paper-generation-job",
  "create-document-processing-job",
  "retry-document-processing-job",
  "cancel-document-processing-job",
  "company-research",
  "export-user-data",
  "razorpay-create-order",
  "razorpay-verify-payment",
  "moderate-content",
  "score-coding-submission",
  "search-exams",
  "check-exam-paper-availability",
  "get-paper-generation-job",
  "get-document-processing-job",
  "analytics-dashboard",
  "compare-sessions",
  "sync-calendar",
  "disconnect-calendar",
  "ai-coach-chat",
  "gap-analysis",
  "analyze-test-performance",
]);

/**
 * TypeError ("Failed to fetch") retries are allowed only for safe, idempotent
 * reads. Every other Edge call is a single attempt — mutations must not
 * double-process after a transport glitch.
 */
const SAFE_NETWORK_RETRY_FNS = new Set([
  "ping",
  "hybrid-health",
  "hybrid-ping",
  "ai-key-check",
  "billing-catalog",
  "billing-status",
  "get-exam-details",
  "get-exam-pattern",
  "get-exam-syllabus",
  "list-previous-papers",
]);

function networkRetryAttempts(fnName: string): number {
  if (NO_NETWORK_RETRY_FNS.has(fnName)) return 0;
  if (SAFE_NETWORK_RETRY_FNS.has(fnName)) return NETWORK_RETRY_DELAYS_MS.length;
  return 0;
}

function existingIdempotencyKey(headers: Record<string, string>): string | undefined {
  const key =
    headers["x-idempotency-key"] ??
    headers["X-Idempotency-Key"] ??
    headers["Idempotency-Key"] ??
    headers["idempotency-key"];
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

/**
 * Mutations that are coalesced (double-click / Strict Mode) share one flight.
 * Attach a key so a later retry of the same user action can replay server-side.
 * Skip GET and allowlisted read/anon probes.
 */
function shouldAutoAttachIdempotency(method: string, fnName: string): boolean {
  if (method === "GET" || method === "HEAD") return false;
  if (SAFE_NETWORK_RETRY_FNS.has(fnName)) return false;
  if (ANON_OK_EDGE_FNS.has(fnName)) return false;
  return NO_NETWORK_RETRY_FNS.has(fnName);
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const reason = signal.reason;
  if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
  if (reason instanceof Error && reason.name === "AbortError") throw reason;
  throw new DOMException("The operation was aborted.", "AbortError");
}

/** Race a promise against an AbortSignal so auth/session probes cannot outlive the request budget. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error
        ? new DOMException("The operation was aborted.", "AbortError")
        : new DOMException("The operation was aborted.", "AbortError"),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (err) => {
        cleanup();
        reject(err);
      },
    );
  });
}

function unreachableUserMessage(fnName: string): string {
  if (fnName === "delete-account") {
    return "We couldn't complete account deletion right now. Please try again in a moment.";
  }
  if (OPERATIONAL_EDGE_FNS.has(fnName)) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  return "The AI request did not go through. Please try again.";
}

const NETWORK_RETRY_DELAYS_MS =
  import.meta.env.MODE === "test" ? [0, 0] : [300, 800];

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Prefer a live (refreshed-if-near-expiry) access token. Never attach a shared
 * JWT after tab-local logout. Do not fall back to the publishable key as a
 * fake user Bearer — that is the AUTH_INVALID regression for signed-in UI.
 */
async function readToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | undefined> {
  if (isTabLocalLogout()) {
    return undefined;
  }

  try {
    const ensured = await ensureAuthSession({
      forceRefresh: options?.forceRefresh === true,
    });
    if (ensured.expired) {
      return undefined;
    }
    const ensuredToken = ensured.session?.access_token;
    if (typeof ensuredToken === "string" && ensuredToken.trim()) {
      return ensuredToken.trim();
    }
  } catch (error) {
    logger.warn("auth.session.recovery.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    logger.warn("auth.session.recovery.failed", { error: error.message });
    return undefined;
  }
  const fresh = data?.session?.access_token;
  if (typeof fresh === "string" && fresh.trim()) return fresh.trim();

  return undefined;
}

function isAuthRetryableStatus(status: number, code?: string, message?: string): boolean {
  if (status !== 401) return false;
  const normalized = `${code ?? ""} ${message ?? ""}`.toUpperCase();
  // Empty / gateway bodies ("Invalid JWT") must still trigger one refresh retry.
  if (!normalized.trim()) return true;
  return (
    normalized.includes("AUTH_EXPIRED") ||
    normalized.includes("AUTH_INVALID") ||
    normalized.includes("AUTH_REQUIRED") ||
    normalized.includes("UNAUTHORIZED") ||
    normalized.includes("EXPIRED") ||
    normalized.includes("INVALID OR EXPIRED") ||
    normalized.includes("INVALID JWT") ||
    normalized.includes("JWT")
  );
}

export async function getAuthHeaders(
  extraHeaders?: Record<string, string>,
  options?: { forceRefresh?: boolean; allowAnonBearer?: boolean },
): Promise<Record<string, string>> {
  const token = await readToken({ forceRefresh: options?.forceRefresh });
  const trainingConsent = allowsAiTraining(
    useAuthStore.getState().profile?.privacy_prefs,
  );

  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "x-client-info": "clarify-web",
    "x-ai-training-consent": trainingConsent ? "true" : "false",
    ...extraHeaders,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (options?.allowAnonBearer) {
    // Gateway still requires an Authorization JWT for some public probes.
    headers.Authorization = `Bearer ${SUPABASE_PUBLISHABLE_KEY}`;
  }

  return headers;
}

/**
 * Supports EDGE_BASE values like:
 * - https://xyz.supabase.co/functions/v1
 * - https://xyz.supabase.co
 * - custom edge proxy base
 */
function buildEdgeUrl(fnName: string): string {
  const base = String(EDGE_BASE ?? "").replace(/\/+$/, "");

  if (!base) throw new Error("EDGE_BASE is not configured");

  if (base.endsWith("/functions/v1")) return `${base}/${fnName}`;
  if (base.includes("/functions/v1/")) {
    const normalized = base.replace(/\/functions\/v1\/.*/, "/functions/v1");
    return `${normalized}/${fnName}`;
  }

  return `${base}/functions/v1/${fnName}`;
}

type FetchEdgeOptions = {
  method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  signal?: AbortSignal;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

type BufferedEdgeResponse = {
  status: number;
  statusText: string;
  headers: [string, string][];
  buf: ArrayBuffer;
};

function shouldCoalesceEdge(
  body: Record<string, unknown> | FormData | undefined,
  options?: FetchEdgeOptions,
): boolean {
  if (body instanceof FormData) return false;
  if (options?.signal) return false;
  return true;
}

function replayBufferedResponse(snap: BufferedEdgeResponse): Response {
  return new Response(snap.buf.slice(0), {
    status: snap.status,
    statusText: snap.statusText,
    headers: new Headers(snap.headers),
  });
}

/**
 * One in-flight Edge call per method + function + body. Double-clicks and
 * Strict Mode remounts join the same flight instead of issuing a second POST.
 * Callers that pass AbortSignal (typeahead) skip coalescing so cancel stays local.
 */
export async function fetchEdge(
  fnName: string,
  body?: Record<string, unknown> | FormData,
  options?: FetchEdgeOptions,
): Promise<Response> {
  if (!shouldCoalesceEdge(body, options)) {
    return executeFetchEdge(fnName, body, options);
  }
  const key = coalesceKey({
    method: options?.method ?? "POST",
    fnName,
    body,
  });
  const snap = await singleFlight(key, async () => {
    const res = await executeFetchEdge(fnName, body, options);
    const buf = await res.arrayBuffer();
    return {
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers.entries()],
      buf,
    } satisfies BufferedEdgeResponse;
  });
  return replayBufferedResponse(snap);
}

async function executeFetchEdge(
  fnName: string,
  body?: Record<string, unknown> | FormData,
  options?: FetchEdgeOptions,
): Promise<Response> {
  if (getPrivateMode() && !PRIVATE_MODE_ALLOWLIST.has(fnName)) {
    throw new Error(
      "Private mode is enabled — cloud AI and analysis are paused. Turn off private mode in Settings → Privacy to continue.",
    );
  }

  const method = options?.method ?? "POST";
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const isFormData = body instanceof FormData;
  const allowAnonBearer = ANON_OK_EDGE_FNS.has(fnName);

  const timeoutController = new AbortController();
  const timeout =
    timeoutMs > 0 ? setTimeout(() => timeoutController.abort(new Error("Timeout")), timeoutMs) : null;

  // Combine caller signal with internal timeout timer so both can abort the request
  if (options?.signal) {
    if (options.signal.aborted) {
      timeoutController.abort(options.signal.reason);
    } else {
      options.signal.addEventListener("abort", () => {
        timeoutController.abort(options?.signal?.reason ?? new Error("Aborted by caller"));
      });
    }
  }
  const signal = timeoutController.signal;

  const requestId =
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);

  const callerHeaders = options?.headers ?? {};
  const autoIdempotency =
    shouldAutoAttachIdempotency(method, fnName) && !existingIdempotencyKey(callerHeaders)
      ? createIdempotencyKey(fnName)
      : null;

  const buildHeaders = async (forceRefresh = false) =>
    getAuthHeaders(
      {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        "x-request-id": requestId,
        ...(autoIdempotency
          ? { "x-idempotency-key": autoIdempotency, "Idempotency-Key": autoIdempotency }
          : {}),
        ...callerHeaders,
      },
      { forceRefresh, allowAnonBearer },
    );

  try {
    let headers = await raceAbort(buildHeaders(false), signal);
    throwIfAborted(signal);

    if (!headers.Authorization && !allowAnonBearer) {
      throw new ApiClientError({
        message: "Sign in to continue.",
        status: 401,
        code: "AUTH_REQUIRED",
      });
    }

    const url = buildEdgeUrl(fnName);
    const payload =
      body === undefined
        ? undefined
        : isFormData
          ? body
          : JSON.stringify(body);

    const doFetch = (hdrs: Record<string, string>) =>
      fetch(url, {
        method,
        headers: hdrs,
        body: payload,
        signal,
      });

    let lastErr: unknown;
    const maxAttempts = networkRetryAttempts(fnName);
    let authRetried = false;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      if (attempt > 0) {
        if (signal.aborted) break;
        await new Promise((r) => setTimeout(r, NETWORK_RETRY_DELAYS_MS[attempt - 1]));
        if (signal.aborted) break;
      }
      try {
        let response = await doFetch(headers);


        // One safe refresh/retry for expired/invalid JWTs — never loop.
        if (
          !authRetried &&
          !allowAnonBearer &&
          !isTabLocalLogout() &&
          response.status === 401
        ) {
          const peekText = await response.clone().text().catch(() => "");
          const peek = peekText ? safeJsonParse(peekText) : null;
          const code =
            typeof peek?.code === "string"
              ? peek.code
              : typeof peek?.error?.code === "string"
                ? peek.error.code
                : undefined;
          const message =
            typeof peek?.error === "string"
              ? peek.error
              : typeof peek?.message === "string"
                ? peek.message
                : undefined;
          if (isAuthRetryableStatus(401, code, message)) {
            authRetried = true;
            headers = await raceAbort(buildHeaders(true), signal);
            throwIfAborted(signal);
            if (headers.Authorization) {
              response = await doFetch(headers);
            }
          }
        }

        return response;
      } catch (err: unknown) {
        lastErr = err;
        const retryable =
          err instanceof TypeError &&
          !signal.aborted &&
          attempt < maxAttempts;
        if (!retryable) throw err;
        logger.warn("network.request.retry", {
          fnName,
          attempt: attempt + 1,
          requestId,
        });
      }
    }
    throw lastErr;
  } catch (err: unknown) {
    const abortName =
      err && typeof err === "object" && "name" in err
        ? String((err as { name?: unknown }).name ?? "")
        : "";
    const abortMessage = err instanceof Error ? err.message : String(err ?? "");
    const isAbort =
      abortName === "AbortError" ||
      abortName === "TimeoutError" ||
      abortMessage === "The operation was aborted.";
    if (isAbort) {
      if (options?.signal?.aborted) {
        throw new Error(
          fnName === "delete-account"
            ? "Account deletion was cancelled."
            : "Request was cancelled. Please try again.",
        );
      }
      logger.warn("network.request.transient_failure", {
        fnName,
        timeoutMs,
        reason: "timeout",
        requestId,
      });
      throw new Error("The request timed out. Please try again.");
    }
    if (err instanceof TypeError) {
      // CORS blocks / network failures surface as TypeError("Failed to fetch").
      // Never name the Edge Function — especially sensitive for delete-account UX.
      logger.error("network.request.transient_failure", {
        fnName,
        reason: "unreachable",
        requestId,
      });
      throw new Error(unreachableUserMessage(fnName));
    }
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Preserve hybrid envelope `source` / `meta` when unwrapping `data`. */
function unwrapHybridPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const envelope = payload as Record<string, unknown>;
  if (envelope.success !== true || envelope.data === undefined) {
    return envelope.data ?? payload;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const merged = { ...(data as Record<string, unknown>) };
  if (merged.source === undefined && typeof envelope.source === "string") {
    merged.source = envelope.source;
  }
  if (merged.meta === undefined && envelope.meta && typeof envelope.meta === "object") {
    merged.meta = envelope.meta;
  }
  return merged;
}

export async function fetchEdgeJson<T>(
  fnName: string,
  body?: Record<string, unknown> | FormData,
  options?: {
    method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
    signal?: AbortSignal;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }
): Promise<T> {
  const response = await fetchEdge(fnName, body, options);

  // read text first so we never lose the body
  const text = await response.text().catch(() => "");
  const payload = text ? safeJsonParse(text) ?? { error: text } : {};

  // #region agent log
  {
    const code =
      typeof (payload as { code?: unknown })?.code === "string"
        ? (payload as { code: string }).code
        : typeof (payload as { error?: { code?: unknown } })?.error?.code === "string"
          ? (payload as { error: { code: string } }).error.code
          : null;
    debugLog161d95({
      hypothesisId: "H1-H4",
      location: "fetchEdge.ts:fetchEdgeJson",
      message: "edge_response",
      data: {
        fnName,
        status: response.status,
        ok: response.ok,
        code,
        message:
          typeof (payload as { message?: unknown })?.message === "string"
            ? String((payload as { message: string }).message).slice(0, 160)
            : typeof (payload as { error?: unknown })?.error === "string"
              ? String((payload as { error: string }).error).slice(0, 160)
              : null,
      },
    });
    if (
      fnName === "create-exam-paper" ||
      fnName === "get-paper-generation-job" ||
      fnName === "check-exam-paper-availability" ||
      fnName === "generate-topic-practice" ||
      fnName === "cancel-paper-generation-job"
    ) {
      const rec = payload as Record<string, unknown>;
      debugLog4a9592({
        hypothesisId: response.status === 429 ? "H-A" : "H-B",
        location: "fetchEdge.ts:fetchEdgeJson",
        message: "gov_edge_response",
        data: {
          fnName,
          status: response.status,
          ok: response.ok,
          code,
          jobId: typeof rec.jobId === "string" ? rec.jobId.slice(0, 8) : null,
          jobStatus: typeof rec.status === "string" ? rec.status : null,
          creditsCharged: typeof rec.creditsCharged === "number" ? rec.creditsCharged : null,
          async: rec.async === true,
          idempotentReplay: rec.idempotentReplay === true,
        },
      });
    }
  }
  // #endregion

  if (!response.ok) {
    const fallback =
      fnName === "delete-account"
        ? "We couldn't complete account deletion right now. Please try again or contact support."
        : "Something went wrong. Please try again.";
    const rawError = payload?.error;
    const message =
      typeof rawError === "string"
        ? rawError
        : typeof rawError?.message === "string"
          ? rawError.message
          : typeof payload?.message === "string"
            ? payload.message
            : fallback;
    const code =
      typeof payload?.code === "string" && payload.code.trim()
        ? payload.code.trim()
        : typeof rawError?.code === "string"
          ? rawError.code
          : "API_ERROR";
    const correlationId =
      (typeof payload?.correlation_id === "string" && payload.correlation_id) ||
      (typeof payload?.correlationId === "string" && payload.correlationId) ||
      (typeof payload?.requestId === "string" && payload.requestId) ||
      (typeof rawError?.correlation_id === "string" && rawError.correlation_id) ||
      response.headers.get("x-correlation-id") ||
      response.headers.get("x-request-id") ||
      undefined;
    const logFields = {
      fnName,
      status: response.status,
      code,
      requestId: correlationId,
    };
    if (isExpectedBusinessFailure(response.status, code)) {
      logger.info("network.request.business", {
        ...logFields,
        outcome: "skipped" as const,
        retryable: false,
      });
    } else {
      logger.warn("network.request.failed", logFields);
    }
    throw new ApiClientError({
      message: typeof message === "string" ? message : fallback,
      status: response.status,
      code,
      errorId: correlationId,
      details: payload,
    });
  }

  if (!CREDIT_REFRESH_SKIP.has(fnName)) {
    // Dynamic import avoids fetchEdge ↔ creditsManager at module init (boot TDZ).
    const { refreshCredits } = await import("@/lib/billing/creditsManager");
    void refreshCredits();
  }

  return unwrapHybridPayload(payload) as T;
}
