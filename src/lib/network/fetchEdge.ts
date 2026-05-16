// src/lib/network/fetchEdge.ts
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

/**
 * Read the JWT from the in-memory authStore first (sync, zero IO).
 * Only falls back to supabase.auth.getSession() when the store is empty.
 */
async function readToken(): Promise<string | undefined> {
  const cached = useAuthStore.getState().session?.access_token;
  if (cached) return cached;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

export async function getAuthHeaders(
  extraHeaders?: Record<string, string>
): Promise<Record<string, string>> {
  const token = await readToken();
  return {
    ...(token
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` }),
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...extraHeaders,
  };
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
  const method = options?.method ?? "POST";
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const isFormData = body instanceof FormData;

  // Internal timeout controller — aborts if edge function hangs
  const controller = new AbortController();
  const timeout =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const signal = options?.signal ?? controller.signal;

  const headers = await getAuthHeaders({
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options?.headers ?? {}),
  });

  try {
    const response = await fetch(`${EDGE_BASE}/${fnName}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
          ? body
          : JSON.stringify(body),
      signal,
    });
    return response;
  } catch (err: unknown) {
    // Improve error message for CORS / network failures
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Edge Function "${fnName}" timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(
        `Edge Function "${fnName}" is unreachable. ` +
          `Check CORS configuration and that the function is deployed.`
      );
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

  // ✅ FIX: read text first so we never lose the body (json() can consume it)
  const text = await response.text().catch(() => "");
  const payload = text ? safeJsonParse(text) ?? { error: text } : {};

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `Edge Function "${fnName}" failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return (payload?.data ?? payload) as T;
}
