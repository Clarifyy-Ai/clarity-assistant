// src/lib/network/fetchEdge.ts
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

/**
 * Read JWT from auth store first (fast path, no network).
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
  const method = options?.method ?? "POST";
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const isFormData = body instanceof FormData;

  const timeoutController = new AbortController();
  const timeout =
    timeoutMs > 0 ? setTimeout(() => timeoutController.abort(), timeoutMs) : null;

  // If caller provides a signal, we respect it. Otherwise we use internal timeout.
  const signal = options?.signal ?? timeoutController.signal;

  const headers = await getAuthHeaders({
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options?.headers ?? {}),
  });

  try {
    const url = buildEdgeUrl(fnName);

    const response = await fetch(url, {
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
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Edge Function "${fnName}" timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(
        `Edge Function "${fnName}" is unreachable. Check CORS configuration and deployment.`
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

  // read text first so we never lose the body
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
