// src/lib/network/fetchEdge.ts
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

/**
 * Read the JWT from the in-memory authStore first (sync, zero IO).
 * Only fall back to supabase.auth.getSession() when the store is empty —
 * avoids hitting IndexedDB on every parallel API call.
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
  }
): Promise<Response> {
  const method = options?.method ?? "POST";
  const isFormData = body instanceof FormData;

  const headers = await getAuthHeaders({
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options?.headers ?? {}),
  });

  const response = await fetch(`${EDGE_BASE}/${fnName}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : isFormData
        ? body
        : JSON.stringify(body),
    signal: options?.signal,
  });

  return response;
}

export async function fetchEdgeJson<T>(
  fnName: string,
  body?: Record<string, unknown> | FormData,
  options?: {
    method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }
): Promise<T> {
  const response = await fetchEdge(fnName, body, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `Edge Function "${fnName}" failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return (payload?.data ?? payload) as T;
}
