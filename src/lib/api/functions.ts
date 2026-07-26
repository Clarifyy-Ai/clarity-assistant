// src/lib/api/functions.ts
//
// Typed helpers around centralized apiClient.
//
// SECURITY PURPOSE:
// - Standardize Edge Function invocation
// - Add Idempotency-Key for sensitive operations
// - Provide SSE streaming helper for generate-answer
// - Avoid direct fetch() usage across app

import { EDGE_BASE } from "@/lib/env";
import { getCSRFHeaders } from "@/lib/security";
import {
  apiClient,
  ApiClientError,
  type ApiClientOptions,
} from "@/lib/api/apiClient";
import { useAuthStore } from "@/store/authStore";

export type EdgeFunctionName =
  | "start-session"
  | "end-session"
  | "save-answer"
  | "save-transcript"
  | "generate-answer"
  | "generate-questions"
  | "generate-hint"
  | "generate-debrief"
  | "schedule-interview"
  | "collect-exam-papers"
  | "parse-document"
  | "ai-coach-chat"
  | "deduct-credits"
  | "create-checkout"
  | "create-billing-portal"
  | "cancel-subscription"
  | "resume-subscription";

export type IdempotencyOptions = {
  idempotencyKey?: string;
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

export function getAccessToken(): string | null {
  const token = useAuthStore.getState().session?.access_token;

  if (typeof token === "string" && token.trim().length > 0) {
    return token.trim();
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
  const accessToken = getAccessToken();
  const headers = new Headers();

  headers.set("Accept", "text/event-stream");
  headers.set("Content-Type", "application/json");

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

  const response = await fetch(buildFunctionUrl(functionName), {
    method: "POST",
    headers,
    credentials: "omit",
    signal: createAbortSignal(
      options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
      options.signal
    ),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = await response.text().catch(() => null);
    }

    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error?: unknown }).error)
        : "Streaming request failed.";

    throw new ApiClientError({
      message,
      status: response.status,
      code:
        typeof payload === "object" && payload !== null && "code" in payload
          ? String((payload as { code?: unknown }).code)
          : "STREAM_REQUEST_FAILED",
      details: payload,
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
