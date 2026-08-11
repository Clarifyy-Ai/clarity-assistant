// src/lib/network/fetchEdge.ts
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { getPrivateMode } from "@/hooks/usePrivateMode";
import { EDGE_BASE, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { logger } from "@/lib/logger";
import { isTabLocalLogout } from "@/lib/auth/tabLocalLogout";

/** Edge calls blocked while private mode is on (no cloud AI / analysis). */
const PRIVATE_MODE_ALLOWLIST = new Set([
  "ping",
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
      if (options?.signal?.aborted) {
        throw new Error(`Edge Function "${fnName}" call was aborted`);
      }
      logger.warn("network.request.transient_failure", { fnName, timeoutMs, reason: "timeout" });
      throw new Error(`Edge Function "${fnName}" timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      logger.error("network.request.transient_failure", { fnName, reason: "unreachable" });
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

  if (!CREDIT_REFRESH_SKIP.has(fnName)) {
    void refreshCredits();
  }

  return (payload?.data ?? payload) as T;
}
