// src/lib/network/apiClient.ts — PRODUCTION READY
import { supabase } from "@/lib/supabase/client";

// Keep existing import (your file uses authStore)
import { useAuthStore as useAuthStoreLegacy } from "@/store/authStore";

// Add userStore (used across your overlay/live code)
import { useAuthStore as useUserStore } from "@/store/userStore";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504] as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestConfig<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  withAuth?: boolean;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  ok: boolean;
}

export interface ApiErrorShape {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
  status?: number;
}

/**
 * Get current JWT.
 * Tries both stores (authStore + userStore) to avoid token mismatch issues.
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const cachedA = useAuthStoreLegacy.getState().session?.access_token;
    if (cachedA) return cachedA;

    const cachedB = useUserStore.getState().session?.access_token;
    if (cachedB) return cachedB;

    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.includes(status as (typeof RETRYABLE_STATUSES)[number]);
}

function withTimeout(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "AbortError"));
  }, timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; error?: unknown };
    if (typeof maybe.message === "string") return maybe.message;
    if (typeof maybe.error === "string") return maybe.error;
  }
  return "Request failed";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  if (contentType.includes("text/")) {
    return (await response.text()) as unknown as T;
  }

  return (await response.blob()) as unknown as T;
}

function attachByokHeaders(finalHeaders: Record<string, string>) {
  // Read BYOK keys from either store (no breaking changes)
  try {
    const byokA = useAuthStoreLegacy.getState().byokKeys ?? {};
    if (byokA.openai) finalHeaders["x-byok-openai"] = byokA.openai;
    if (byokA.anthropic) finalHeaders["x-byok-anthropic"] = byokA.anthropic;
    if (byokA.gemini) finalHeaders["x-byok-gemini"] = byokA.gemini;
  } catch {
    // ignore
  }

  try {
    const byokB = (useUserStore.getState() as any).byokKeys ?? {};
    if (byokB.openai) finalHeaders["x-byok-openai"] = byokB.openai;
    if (byokB.anthropic) finalHeaders["x-byok-anthropic"] = byokB.anthropic;
    if (byokB.gemini) finalHeaders["x-byok-gemini"] = byokB.gemini;
  } catch {
    // ignore
  }
}

async function request<TResponse, TBody = unknown>(
  url: string,
  config: RequestConfig<TBody> = {}
): Promise<ApiResponse<TResponse>> {
  const {
    method = "GET",
    body,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRY_COUNT,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    withAuth = true,
    signal,
  } = config;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (!isFormData) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (withAuth) {
    const token = await getAuthToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  // Preserve BYOK forwarding feature
  attachByokHeaders(finalHeaders);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal: timeoutSignal, cleanup } = withTimeout(signal, timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body:
          body === undefined
            ? undefined
            : isFormData
              ? (body as unknown as FormData)
              : JSON.stringify(body),
        signal: timeoutSignal,
      });

      const data = await parseResponse<TResponse | ApiErrorShape>(response);
      cleanup();

      if (!response.ok) {
        const message =
          (data as ApiErrorShape)?.error ||
          (data as ApiErrorShape)?.message ||
          `HTTP ${response.status}: ${response.statusText}`;

        if (response.status === 429 && attempt < retries) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter ? Number(retryAfter) * 1000 : retryDelayMs * (attempt + 1);
          await sleep(delay);
          continue;
        }

        if (isRetryable(response.status) && attempt < retries) {
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }

        throw new Error(message);
      }

      return {
        data: data as TResponse,
        status: response.status,
        headers: response.headers,
        ok: true,
      };
    } catch (error) {
      cleanup();
      lastError = error instanceof Error ? error : new Error(extractErrorMessage(error));

      if (attempt < retries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }

      break;
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}

export const apiClient = {
  get<T>(url: string, config?: Omit<RequestConfig, "method" | "body">): Promise<ApiResponse<T>> {
    return request<T>(url, { ...config, method: "GET" });
  },

  post<T, B = unknown>(
    url: string,
    body?: B,
    config?: Omit<RequestConfig<B>, "method" | "body">
  ): Promise<ApiResponse<T>> {
    return request<T, B>(url, { ...config, method: "POST", body });
  },

  put<T, B = unknown>(
    url: string,
    body?: B,
    config?: Omit<RequestConfig<B>, "method" | "body">
  ): Promise<ApiResponse<T>> {
    return request<T, B>(url, { ...config, method: "PUT", body });
  },

  patch<T, B = unknown>(
    url: string,
    body?: B,
    config?: Omit<RequestConfig<B>, "method" | "body">
  ): Promise<ApiResponse<T>> {
    return request<T, B>(url, { ...config, method: "PATCH", body });
  },

  delete<T>(url: string, config?: Omit<RequestConfig, "method" | "body">): Promise<ApiResponse<T>> {
    return request<T>(url, { ...config, method: "DELETE" });
  },

  async invokeFunction<T>(
    functionName: string,
    body?: Record<string, unknown> | FormData,
    options?: { headers?: Record<string, string> }
  ): Promise<T> {
    const { data, error } = await supabase.functions.invoke<T>(functionName, {
      body,
      headers: options?.headers,
    });

    if (error) {
      throw new Error(error.message || `Edge function "${functionName}" failed`);
    }

    return data as T;
  },

  async upload<T>(
    url: string,
    file: File | Blob,
    config?: Omit<RequestConfig<FormData>, "method" | "body"> & { fieldName?: string }
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append(config?.fieldName ?? "file", file);

    return request<T, FormData>(url, { ...config, method: "POST", body: formData });
  },

  /**
   * Stream helper (generic SSE reader).
   * NOTE: Your Gemini full-answer already has its own SSE parser in geminiClient.ts
   * which decodes JSON {text}. This function remains unchanged for other streams.
   */
  async stream(
    url: string,
    body: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    config?: Omit<RequestConfig, "method">
  ): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(config?.headers ?? {}),
    };

    if (config?.withAuth !== false) {
      const token = await getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    attachByokHeaders(headers);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: config?.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream request failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true }).replace(/\r/g, "");
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const chunk = line.slice(6).trim();
            if (chunk && chunk !== "[DONE]") onChunk(chunk);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
