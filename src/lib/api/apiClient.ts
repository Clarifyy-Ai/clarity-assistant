// src/lib/api/apiClient.ts
//
// Production-ready API client for frontend network calls.
//
// SECURITY PURPOSE:
// - Centralize fetch usage
// - Attach Supabase bearer token when available
// - Attach CSRF header for state-changing requests
// - Attach BYOK provider keys as request headers when available
// - Add request timeout support
// - Add safe retry support for transient failures
// - Normalize API errors into a consistent shape
//
// Use this file instead of direct fetch() calls for app/Edge Function requests.

import { EDGE_BASE } from "@/lib/env";
import { getCSRFHeaders } from "@/lib/security";
import { useAuthStore } from "@/store/authStore";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiClientOptions = {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  auth?: boolean;
  csrf?: boolean;
  byok?: boolean;
  signal?: AbortSignal;
};

export type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
  errorId?: string;
  details?: unknown;
};

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly errorId?: string;
  public readonly details?: unknown;

  public constructor(options: {
    message: string;
    status: number;
    code?: string;
    errorId?: string;
    details?: unknown;
  }) {
    super(options.message);

    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code ?? "API_ERROR";
    this.errorId = options.errorId;
    this.details = options.details;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY_MS = 500;

const RETRYABLE_STATUS_CODES = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const STATE_CHANGING_METHODS = new Set<HttpMethod>([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function createAbortSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): AbortSignal {
  const controller = new AbortController();

  const timeout = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timeout);
      controller.abort();
    } else {
      externalSignal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeout);
          controller.abort();
        },
        {
          once: true,
        }
      );
    }
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      window.clearTimeout(timeout);
    },
    {
      once: true,
    }
  );

  return controller.signal;
}

function getAccessToken(): string | null {
  const session = useAuthStore.getState().session;
  const token = session?.access_token;

  if (typeof token === "string" && token.trim().length > 0) {
    return token.trim();
  }

  return null;
}

function getByokHeaders(): Record<string, string> {
  const byokKeys = useAuthStore.getState().byokKeys;
  const headers: Record<string, string> = {};

  if (byokKeys.openai?.trim()) {
    headers["x-byok-openai"] = byokKeys.openai.trim();
  }

  if (byokKeys.anthropic?.trim()) {
    headers["x-byok-anthropic"] = byokKeys.anthropic.trim();
  }

  if (byokKeys.gemini?.trim()) {
    headers["x-byok-gemini"] = byokKeys.gemini.trim();
  }

  return headers;
}

function buildHeaders(
  options: Required<Pick<ApiClientOptions, "auth" | "csrf" | "byok">> & {
    method: HttpMethod;
    customHeaders?: Record<string, string>;
    hasBody: boolean;
  }
): Headers {
  const headers = new Headers();

  headers.set("Accept", "application/json");

  if (options.hasBody) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth) {
    const accessToken = getAccessToken();

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  if (options.csrf && STATE_CHANGING_METHODS.has(options.method)) {
    const csrfHeaders = getCSRFHeaders();

    for (const [key, value] of Object.entries(csrfHeaders)) {
      headers.set(key, value);
    }
  }

  if (options.byok) {
    const byokHeaders = getByokHeaders();

    for (const [key, value] of Object.entries(byokHeaders)) {
      headers.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(options.customHeaders ?? {})) {
    headers.set(key, value);
  }

  return headers;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

function normalizeErrorPayload(payload: unknown): ApiErrorPayload {
  if (isPlainObject(payload)) {
    return {
      error: typeof payload.error === "string" ? payload.error : undefined,
      message:
        typeof payload.message === "string" ? payload.message : undefined,
      code: typeof payload.code === "string" ? payload.code : undefined,
      errorId:
        typeof payload.errorId === "string" ? payload.errorId : undefined,
      details: payload.details,
    };
  }

  if (typeof payload === "string" && payload.trim().length > 0) {
    return {
      error: payload.trim(),
    };
  }

  return {};
}

function normalizeUnknownError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiClientError({
      message: "Request timed out or was cancelled.",
      status: 408,
      code: "REQUEST_ABORTED",
    });
  }

  if (error instanceof TypeError) {
    return new ApiClientError({
      message: "Network request failed. Please check your connection.",
      status: 0,
      code: "NETWORK_ERROR",
      details: error.message,
    });
  }

  if (error instanceof Error) {
    return new ApiClientError({
      message: error.message,
      status: 0,
      code: "UNKNOWN_CLIENT_ERROR",
    });
  }

  return new ApiClientError({
    message: "Unexpected network error.",
    status: 0,
    code: "UNKNOWN_CLIENT_ERROR",
  });
}

function shouldRetry(
  error: unknown,
  attempt: number,
  maxRetries: number
): boolean {
  if (attempt >= maxRetries) {
    return false;
  }

  if (error instanceof ApiClientError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return true;
}

function calculateRetryDelay(baseDelayMs: number, attempt: number): number {
  const exponentialDelay = baseDelayMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 100);

  return exponentialDelay + jitter;
}

async function executeRequest<T>(
  url: string,
  options: ApiClientOptions
): Promise<T> {
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const hasBody = options.body !== undefined && method !== "GET";

  const signal = createAbortSignal(timeoutMs, options.signal);

  const headers = buildHeaders({
    method,
    auth: options.auth ?? true,
    csrf: options.csrf ?? true,
    byok: options.byok ?? true,
    customHeaders: options.headers,
    hasBody,
  });

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers,
      signal,
      credentials: "omit",
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw normalizeUnknownError(error);
  }

  const parsedBody = await parseResponseBody(response);

  if (!response.ok) {
    const errorPayload = normalizeErrorPayload(parsedBody);

    throw new ApiClientError({
      message:
        errorPayload.error ??
        errorPayload.message ??
        `Request failed with status ${response.status}.`,
      status: response.status,
      code: errorPayload.code,
      errorId: errorPayload.errorId,
      details: errorPayload.details ?? parsedBody,
    });
  }

  /**
   * Support Supabase-like envelopes:
   * { data, error }
   *
   * Most of our Edge Functions return direct JSON, so this only unwraps
   * when both keys exist.
   */
  if (isPlainObject(parsedBody) && "data" in parsedBody && "error" in parsedBody) {
    return parsedBody.data as T;
  }

  return parsedBody as T;
}

export async function apiRequest<T>(
  path: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const url = joinUrl(EDGE_BASE, path);

  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await executeRequest<T>(url, options);
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error, attempt, retries)) {
        throw normalizeUnknownError(error);
      }

      await sleep(calculateRetryDelay(retryDelayMs, attempt));
    }
  }

  throw normalizeUnknownError(lastError);
}

export const apiClient = {
  request: apiRequest,

  get<T>(
    path: string,
    options: Omit<ApiClientOptions, "method" | "body"> = {}
  ): Promise<T> {
    return apiRequest<T>(path, {
      ...options,
      method: "GET",
    });
  },

  post<T>(
    path: string,
    body?: unknown,
    options: Omit<ApiClientOptions, "method" | "body"> = {}
  ): Promise<T> {
    return apiRequest<T>(path, {
      ...options,
      method: "POST",
      body,
    });
  },

  put<T>(
    path: string,
    body?: unknown,
    options: Omit<ApiClientOptions, "method" | "body"> = {}
  ): Promise<T> {
    return apiRequest<T>(path, {
      ...options,
      method: "PUT",
      body,
    });
  },

  patch<T>(
    path: string,
    body?: unknown,
    options: Omit<ApiClientOptions, "method" | "body"> = {}
  ): Promise<T> {
    return apiRequest<T>(path, {
      ...options,
      method: "PATCH",
      body,
    });
  },

  delete<T>(
    path: string,
    body?: unknown,
    options: Omit<ApiClientOptions, "method" | "body"> = {}
  ): Promise<T> {
    return apiRequest<T>(path, {
      ...options,
      method: "DELETE",
      body,
    });
  },

  invokeFunction<T>(
    functionName: string,
    body?: unknown,
    options: Omit<ApiClientOptions, "method" | "body"> = {}
  ): Promise<T> {
    return apiRequest<T>(functionName, {
      ...options,
      method: "POST",
      body,
    });
  },
};
