// ─────────────────────────────────────────────────────────────────────────────
// apiClient.ts — Typed HTTP client wrapping fetch() with retries,
// timeout, auth injection, error normalization, and request logging.
// ─────────────────────────────────────────────────────────────────────────────

import { NetworkError, AppError, normalizeError, ErrorCode, tryCatch } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS    = 30000;
const DEFAULT_RETRY_COUNT   = 2;
const RETRY_DELAY_MS        = 500;
const RETRYABLE_STATUSES    = [408, 429, 500, 502, 503, 504];

// ─── Types ────────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestConfig<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  withAuth?: boolean;         // auto-attach Supabase Bearer token
  signal?: AbortSignal;
  onUploadProgress?: (percent: number) => void;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  ok: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

// ─── Auth Token Helper ────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// ─── Retry Helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.includes(status);
}

// ─── Request Timeout ──────────────────────────────────────────────────────────

function withTimeout(
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new NetworkError("Request timed out", ErrorCode.NETWORK_TIMEOUT));
  }, timeoutMs);

  // Also abort if external signal fires
  signal?.addEventListener("abort", () => controller.abort(signal.reason));

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

// ─── Core Request ─────────────────────────────────────────────────────────────

async function request<TResponse, TBody = unknown>(
  url: string,
  config: RequestConfig<TBody> = {}
): Promise<ApiResponse<TResponse>> {
  const {
    method      = "GET",
    body,
    headers     = {},
    timeoutMs   = DEFAULT_TIMEOUT_MS,
    retries     = DEFAULT_RETRY_COUNT,
    retryDelayMs = RETRY_DELAY_MS,
    withAuth    = true,
    signal,
  } = config;

  // Build headers
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
    ...headers,
  };

  if (withAuth) {
    const token = await getAuthToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const { signal: timeoutSignal, cleanup } = withTimeout(signal, timeoutMs);

  let lastError: AppError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: timeoutSignal,
      });

      cleanup();

      // Parse response
      let data: TResponse;
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else if (contentType.includes("text/")) {
        data = (await response.text()) as unknown as TResponse;
      } else {
        data = (await response.blob()) as unknown as TResponse;
      }

      // Handle HTTP errors
      if (!response.ok) {
        const apiError = data as unknown as ApiError;

        // Rate limited — always retry with backoff
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : retryDelayMs * (attempt + 1);
          if (attempt < retries) {
            await sleep(delay);
            continue;
          }
        }

        if (isRetryable(response.status) && attempt < retries) {
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }

        throw new NetworkError(
          apiError?.message ?? `HTTP ${response.status}: ${response.statusText}`,
          response.status === 429
            ? ErrorCode.NETWORK_RATE_LIMITED
            : ErrorCode.NETWORK_REQUEST_FAILED,
          { status: response.status, url, method }
        );
      }

      return {
        data,
        status: response.status,
        headers: response.headers,
        ok: true,
      };
    } catch (error) {
      cleanup();

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new NetworkError("Request was aborted.", ErrorCode.NETWORK_TIMEOUT, { url });
      }

      lastError = normalizeError(error);

      if (attempt < retries && !(lastError instanceof NetworkError && lastError.code === ErrorCode.NETWORK_OFFLINE)) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }

      break;
    }
  }

  throw lastError ?? new NetworkError("Request failed after retries.", ErrorCode.NETWORK_REQUEST_FAILED);
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const apiClient = {
  /**
   * GET request — fetches data from a URL.
   * @example
   * const { data } = await apiClient.get<User[]>("/api/users");
   */
  get<T>(url: string, config?: Omit<RequestConfig, "method" | "body">): Promise<ApiResponse<T>> {
    return request<T>(url, { ...config, method: "GET" });
  },

  /**
   * POST request — sends JSON body and returns response.
   * @example
   * const { data } = await apiClient.post<Session>("/api/sessions", { userId });
   */
  post<T, B = unknown>(url: string, body?: B, config?: Omit<RequestConfig<B>, "method" | "body">): Promise<ApiResponse<T>> {
    return request<T, B>(url, { ...config, method: "POST", body });
  },

  /**
   * PUT request — full replacement of a resource.
   */
  put<T, B = unknown>(url: string, body?: B, config?: Omit<RequestConfig<B>, "method" | "body">): Promise<ApiResponse<T>> {
    return request<T, B>(url, { ...config, method: "PUT", body });
  },

  /**
   * PATCH request — partial update of a resource.
   */
  patch<T, B = unknown>(url: string, body?: B, config?: Omit<RequestConfig<B>, "method" | "body">): Promise<ApiResponse<T>> {
    return request<T, B>(url, { ...config, method: "PATCH", body });
  },

  /**
   * DELETE request — remove a resource.
   */
  delete<T>(url: string, config?: Omit<RequestConfig, "method" | "body">): Promise<ApiResponse<T>> {
    return request<T>(url, { ...config, method: "DELETE" });
  },

  /**
   * Supabase Edge Function invoker — typed wrapper around supabase.functions.invoke().
   * @example
   * const { data } = await apiClient.invokeFunction<HintResponse>("generate-hint", { questionText });
   */
  async invokeFunction<T>(
    functionName: string,
    body?: Record<string, unknown>,
    options?: { headers?: Record<string, string> }
  ): Promise<T> {
    const [result, err] = await tryCatch(async () => {
      const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
        headers: options?.headers,
      });
      if (error) throw error;
      return data as T;
    });

    if (err) {
      throw new NetworkError(
        `Edge function "${functionName}" failed: ${err.message}`,
        ErrorCode.NETWORK_REQUEST_FAILED,
        { functionName, body }
      );
    }

    return result!;
  },

  /**
   * Upload a file as multipart/form-data with optional progress tracking.
   * @example
   * const { data } = await apiClient.upload<UploadResponse>(
   *   "/api/upload",
   *   file,
   *   { onUploadProgress: (pct) => setProgress(pct) }
   * );
   */
  async upload<T>(
    url: string,
    file: File | Blob,
    config?: Omit<RequestConfig, "method" | "body"> & { fieldName?: string }
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append(config?.fieldName ?? "file", file);

    const headers: Record<string, string> = { ...(config?.headers ?? {}) };

    if (config?.withAuth !== false) {
      const token = await getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    // Native fetch upload (progress tracking via XHR if needed)
    const { signal: timeoutSignal, cleanup } = withTimeout(
      config?.signal,
      config?.timeoutMs ?? 60000 // longer timeout for uploads
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        signal: timeoutSignal,
      });

      cleanup();

      const data: T = await response.json();

      if (!response.ok) {
        throw new NetworkError(
          `Upload failed: HTTP ${response.status}`,
          ErrorCode.NETWORK_REQUEST_FAILED,
          { status: response.status, url }
        );
      }

      return { data, status: response.status, headers: response.headers, ok: true };
    } catch (error) {
      cleanup();
      throw normalizeError(error);
    }
  },

  /**
   * Stream a Server-Sent Events (SSE) response — for AI streaming.
   * @example
   * await apiClient.stream("/api/stream-answer", { prompt }, (chunk) => {
   *   setAnswer((prev) => prev + chunk);
   * });
   */
  async stream(
    url: string,
    body: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    config?: Omit<RequestConfig, "method">
  ): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept":       "text/event-stream",
      ...(config?.headers ?? {}),
    };

    if (config?.withAuth !== false) {
      const token = await getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: config?.signal,
    });

    if (!response.ok || !response.body) {
      throw new NetworkError(
        `Stream request failed: HTTP ${response.status}`,
        ErrorCode.NETWORK_REQUEST_FAILED
      );
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });

        // Parse SSE format: "data: {chunk}\n\n"
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const chunk = line.slice(6).trim();
            if (chunk && chunk !== "[DONE]") {
              onChunk(chunk);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
