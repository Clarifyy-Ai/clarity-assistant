// src/lib/network/fetchEdge.ts
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { getPrivateMode } from "@/hooks/usePrivateMode";
import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { logger } from "@/lib/logger";
import { isTabLocalLogout } from "@/lib/auth/tabLocalLogout";
import { ApiClientError } from "@/lib/api/apiClient";

/** Edge calls blocked while private mode is on (no cloud AI / analysis). */
const PRIVATE_MODE_ALLOWLIST = new Set([
  "ping",
  // Live Chat is human support, not cloud AI — keep available in private mode.
  "support-chat",
]);

/** Edge functions that do not deduct credits — skip balance refresh. */
const CREDIT_REFRESH_SKIP = new Set([
  "ping",
  "stripe-webhook",
  "create-checkout",
  "create-portal-session",
  "ai-hub-router",
  "support-chat",
]);

/** Non-AI functions should not blame an "AI request" on CORS / network failure. */
const OPERATIONAL_EDGE_FNS = new Set([
  "submit-test",
  "create-test",
  "create-exam-paper",
  "process-paper-generation-job",
  "select-test-questions",
  "get-exam-details",
  "search-exams",
  "list-previous-papers",
  "ping",
  "create-checkout",
  "create-portal-session",
]);

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

/**
 * ✅ FIX P7-C: Always read a fresh JWT at call time (session may have refreshed).
 */
async function readToken(): Promise<string | undefined> {
  // This tab logged out independently — never attach the shared-session JWT.
  if (isTabLocalLogout()) {
    return undefined;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    logger.warn("auth.session.recovery.failed", { error: error.message });
  }
  const fresh = data?.session?.access_token;
  if (fresh) return fresh;
  return useAuthStore.getState().session?.access_token;
}

export async function getAuthHeaders(
  extraHeaders?: Record<string, string>
): Promise<Record<string, string>> {
  const token = await readToken();

  // NOTE: We preserve your behavior:
  // - If user token exists -> use it
  // - Else -> use anon key as Bearer for Supabase gateway compatibility
  return {
    ...(token
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` }),
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...extraHeaders,
  };
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

export async function fetchEdge(
  fnName: string,
  body?: Record<string, unknown> | FormData,
  options?: {
    method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
    signal?: AbortSignal;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }
): Promise<Response> {
  if (getPrivateMode() && !PRIVATE_MODE_ALLOWLIST.has(fnName)) {
    throw new Error(
      "Private mode is enabled — cloud AI and analysis are paused. Turn off private mode in Settings → Privacy to continue.",
    );
  }

  const method = options?.method ?? "POST";
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const isFormData = body instanceof FormData;

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

  const headers = await getAuthHeaders({
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    "x-request-id": requestId,
    ...(options?.headers ?? {}),
  });

  try {
    const url = buildEdgeUrl(fnName);
    const payload =
      body === undefined
        ? undefined
        : isFormData
          ? body
          : JSON.stringify(body);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        if (signal.aborted) break;
        await new Promise((r) => setTimeout(r, NETWORK_RETRY_DELAYS_MS[attempt - 1]));
        if (signal.aborted) break;
      }
      try {
        return await fetch(url, {
          method,
          headers,
          body: payload,
          signal,
        });
      } catch (err: unknown) {
        lastErr = err;
        const retryable =
          err instanceof TypeError &&
          !signal.aborted &&
          attempt < NETWORK_RETRY_DELAYS_MS.length;
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
    if (err instanceof Error && err.name === "AbortError") {
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

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

  if (!response.ok) {
    const fallback =
      fnName === "delete-account"
        ? "We couldn't complete account deletion right now. Please try again or contact support."
        : `Request failed (HTTP ${response.status}). Please try again.`;
    const message = payload?.error || payload?.message || fallback;
    const code =
      typeof payload?.code === "string" && payload.code.trim()
        ? payload.code.trim()
        : "API_ERROR";
    const correlationId =
      (typeof payload?.correlationId === "string" && payload.correlationId) ||
      (typeof payload?.requestId === "string" && payload.requestId) ||
      response.headers.get("x-request-id") ||
      undefined;
    if (correlationId) {
      logger.warn("network.request.failed", {
        fnName,
        status: response.status,
        code,
        requestId: correlationId,
      });
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
    void refreshCredits();
  }

  return (payload?.data ?? payload) as T;
}
