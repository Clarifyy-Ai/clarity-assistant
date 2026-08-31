// src/lib/api/functions.ts
//
// Typed helpers around centralized apiClient.
//
// SECURITY PURPOSE:
// - Standardize Edge Function invocation
// - Add Idempotency-Key for sensitive operations
// - Provide SSE streaming helper for generate-answer
// - Avoid direct fetch() usage across app

import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { isTabLocalLogout } from "@/lib/auth/tabLocalLogout";
import { getCSRFHeaders } from "@/lib/security";
import {
  apiClient,
  ApiClientError,
  type ApiClientOptions,
} from "@/lib/api/apiClient";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";

/**
 * Active Supabase Edge function names (folder names under supabase/functions/).
 * Retired stubs may remain typed if still deployed.
 */
export type EdgeFunctionName =
  | "ai-coach-chat"
  | "ai-feedback"
  | "ai-hub-router"
  | "ai-key-check"
  | "analyze-paper-trends"
  | "analyze-test-performance"
  | "analytics-dashboard"
  | "assemble-assessment"
  | "billing-status"
  | "bulk-import-questions"
  | "cancel-document-processing-job"
  | "cancel-paper-generation-job"
  | "cancel-subscription"
  | "check-exam-paper-availability"
  | "collect-exam-papers"
  | "company-research"
  | "compare-sessions"
  | "create-billing-portal"
  | "create-checkout"
  | "create-document-processing-job"
  | "create-exam-paper"
  | "create-test"
  | "deduct-credits"
  | "deepgram-token"
  | "delete-account"
  | "disconnect-calendar"
  | "end-session"
  | "evaluate-auto-approval"
  | "export-user-data"
  | "extract-question-paper"
  | "finalize-session"
  | "gap-analysis"
  | "generate-answer"
  | "generate-debrief"
  | "generate-hint"
  | "generate-practice-questions"
  | "generate-questions"
  | "generate-scorecard"
  | "generate-star-answer"
  | "generate-topic-practice"
  | "get-document-processing-job"
  | "get-exam-details"
  | "get-exam-pattern"
  | "get-exam-syllabus"
  | "get-paper-generation-job"
  | "health"
  | "hybrid-health"
  | "hybrid-ping"
  | "ingest-source-document"
  | "issue-course-certificate"
  | "list-previous-papers"
  | "moderate-content"
  | "parse-document"
  | "parse-question-pdf"
  | "parse-resume"
  | "ping"
  | "polish-star-section"
  | "prep-tool"
  | "process-paper-generation-job"
  | "process-sprint-transcript"
  | "razorpay-create-order"
  | "razorpay-verify-payment"
  | "razorpay-webhook"
  | "recompute-topic-mastery"
  | "reconcile-paper-quality"
  | "record-referral"
  | "report-question"
  | "resume-subscription"
  | "retry-document-processing-job"
  | "run-daily-exam-scrape"
  | "save-answer"
  | "save-attempt-answer"
  | "save-test-answer"
  | "save-transcript"
  | "start-exam"
  | "start-exam-attempt"
  | "start-session"
  | "schedule-interview"
  | "send-interview-reminders"
  | "score-coding-submission"
  | "search-exams"
  | "select-test-questions"
  | "send-email"
  | "stripe-webhook"
  | "submit-test"
  | "support-chat"
  | "sync-calendar"
  | "validate-api-key";

export type IdempotencyOptions = {
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type InvokeOptions = Omit<ApiClientOptions, "method" | "body"> &
  IdempotencyOptions;

export type StreamFunctionOptions = {
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onChunk: (chunk: string) => void;
  onDone?: () => void;
};

const DEFAULT_STREAM_TIMEOUT_MS = 60_000;

export function createIdempotencyKey(prefix = "idem"): string {
  try {
    return `${prefix}:${crypto.randomUUID()}`;
  } catch {
    return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }
}

export function withIdempotencyHeaders(
  headers: Record<string, string> = {},
  idempotencyKey = createIdempotencyKey()
): Record<string, string> {
  return {
    ...headers,
    "Idempotency-Key": idempotencyKey,
  };
}

/** Prefer fresh supabase session JWT; fall back to auth store (fetchEdge-aligned). */
export async function getAccessToken(): Promise<string | null> {
  if (isTabLocalLogout()) {
    return null;
  }

  try {
    const { ensureAuthSession } = await import("@/lib/focusRecovery/sessionRefresh");
    const ensured = await ensureAuthSession();
    const token = ensured.session?.access_token;
    if (typeof token === "string" && token.trim()) return token.trim();
  } catch {
    /* fall through */
  }

  const { data } = await supabase.auth.getSession();
  const fresh = data?.session?.access_token;
  if (typeof fresh === "string" && fresh.trim().length > 0) {
    return fresh.trim();
  }

  const storeToken = useAuthStore.getState().session?.access_token;
  if (typeof storeToken === "string" && storeToken.trim().length > 0) {
    return storeToken.trim();
  }

  return null;
}

/** BYOK product disabled — never forward client API keys. */
function getByokHeaders(): Record<string, string> {
  return {};
}

export function buildFunctionUrl(functionName: string): string {
  return `${EDGE_BASE.replace(/\/+$/, "")}/${functionName.replace(/^\/+/, "")}`;
}

export async function invokeFunction<TResponse, TBody = unknown>(
  functionName: EdgeFunctionName | string,
  body?: TBody,
  options: InvokeOptions = {}
): Promise<TResponse> {
  const { idempotencyKey, headers, ...rest } = options;

  return apiClient.invokeFunction<TResponse>(functionName, body, {
    ...rest,
    headers: idempotencyKey
      ? withIdempotencyHeaders(headers, idempotencyKey)
      : headers,
  });
}

export async function invokeIdempotentFunction<TResponse, TBody = unknown>(
  functionName: EdgeFunctionName | string,
  body?: TBody,
  options: InvokeOptions = {}
): Promise<TResponse> {
  return invokeFunction<TResponse, TBody>(functionName, body, {
    ...options,
    idempotencyKey:
      options.idempotencyKey ?? createIdempotencyKey(functionName),
  });
}

function createAbortSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): AbortSignal {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timer);
      controller.abort();
    } else {
      externalSignal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          controller.abort();
        },
        { once: true }
      );
    }
  }

  controller.signal.addEventListener(
    "abort",
    () => window.clearTimeout(timer),
    { once: true }
  );

  return controller.signal;
}

export async function streamFunction<TBody = unknown>(
  functionName: EdgeFunctionName | string,
  body: TBody,
  options: StreamFunctionOptions
): Promise<void> {
  const accessToken = await getAccessToken();
  const headers = new Headers();

  headers.set("Accept", "text/event-stream");
  headers.set("Content-Type", "application/json");
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  headers.set("x-client-info", "clarify-web");

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  for (const [key, value] of Object.entries(getCSRFHeaders())) {
    headers.set(key, value);
  }

  for (const [key, value] of Object.entries(getByokHeaders())) {
    headers.set(key, value);
  }

  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers.set(key, value);
  }

  const url = buildFunctionUrl(functionName);
  const signal = createAbortSignal(
    options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
    options.signal
  );
  const payload = JSON.stringify(body);

  let response = await fetch(url, {
    method: "POST",
    headers,
    credentials: "omit",
    signal,
    body: payload,
  });

  // One refresh + retry on expired/invalid JWT (fetchEdge parity); do not loop.
  if (response.status === 401 && !isTabLocalLogout()) {
    let authPayload: unknown = null;
    try {
      authPayload = await response.clone().json();
    } catch {
      authPayload = null;
    }
    const code =
      typeof authPayload === "object" &&
      authPayload !== null &&
      "code" in authPayload
        ? String((authPayload as { code?: unknown }).code)
        : "";
    const errMsg =
      typeof authPayload === "object" &&
      authPayload !== null &&
      "error" in authPayload
        ? String((authPayload as { error?: unknown }).error)
        : typeof authPayload === "object" &&
            authPayload !== null &&
            "message" in authPayload
          ? String((authPayload as { message?: unknown }).message)
          : "";
    const normalized = `${code} ${errMsg}`.toUpperCase();
    const isAuthRetryable =
      !normalized.trim() ||
      normalized.includes("AUTH_EXPIRED") ||
      normalized.includes("AUTH_INVALID") ||
      normalized.includes("AUTH_REQUIRED") ||
      normalized.includes("UNAUTHORIZED") ||
      normalized.includes("EXPIRED") ||
      normalized.includes("INVALID OR EXPIRED") ||
      normalized.includes("INVALID JWT") ||
      normalized.includes("JWT");

    if (isAuthRetryable) {
      const { ensureAuthSession } = await import("@/lib/focusRecovery/sessionRefresh");
      const ensured = await ensureAuthSession({ forceRefresh: true });
      const nextToken = ensured.session?.access_token;
      if (nextToken) {
        headers.set("Authorization", `Bearer ${nextToken}`);
        response = await fetch(url, {
          method: "POST",
          headers,
          credentials: "omit",
          signal,
          body: payload,
        });
      }
    }
  }

  if (!response.ok) {
    let errBody: unknown = null;

    try {
      errBody = await response.json();
    } catch {
      errBody = await response.text().catch(() => null);
    }

    const message =
      typeof errBody === "object" && errBody !== null && "error" in errBody
        ? String((errBody as { error?: unknown }).error)
        : "Streaming request failed.";

    throw new ApiClientError({
      message,
      status: response.status,
      code:
        typeof errBody === "object" && errBody !== null && "code" in errBody
          ? String((errBody as { code?: unknown }).code)
          : "STREAM_REQUEST_FAILED",
      details: errBody,
    });
  }

  if (!response.body) {
    throw new ApiClientError({
      message: "Streaming response body is empty.",
      status: response.status,
      code: "EMPTY_STREAM",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.split("\n").find((item) => item.startsWith("data: "));

      if (!line) {
        continue;
      }

      const data = line.slice(6).trim();

      if (data === "[DONE]") {
        options.onDone?.();
        return;
      }

      try {
        const parsed = JSON.parse(data) as { text?: unknown };

        if (typeof parsed.text === "string") {
          options.onChunk(parsed.text);
        }
      } catch {
        options.onChunk(data);
      }
    }
  }

  options.onDone?.();
}
