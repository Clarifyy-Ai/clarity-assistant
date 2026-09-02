/** Bounded timeout for dev debug telemetry — must never block user flows. */
export const DEBUG_INGEST_TIMEOUT_MS = 2000;

export type DebugIngestFields = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
};

/** True only in Vite development builds. Production bundles must no-op. */
export function isDebugIngestEnabled(): boolean {
  return import.meta.env.DEV === true;
}

function sinkPathForSession(sessionId: string): string {
  return `/__agent_debug_${sessionId}`;
}

/**
 * Optional HTTPS telemetry endpoint for non-dev builds.
 * Localhost / loopback URLs are rejected so production cannot accidentally enable dev ingest.
 */
export function resolveProductionTelemetryUrl(): string | null {
  if (import.meta.env.DEV) return null;
  const raw = import.meta.env.VITE_DEBUG_INGEST_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function postFireAndForget(url: string, headers: Record<string, string>, body: string): void {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEBUG_INGEST_TIMEOUT_MS);
    void fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      keepalive: true,
    })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  } catch {
    /* never throw into user flows */
  }
}

/**
 * Dev-only debug telemetry via same-origin Vite middleware (CSP-safe).
 * Production builds no-op unless VITE_DEBUG_INGEST_URL is a secure HTTPS endpoint.
 */
export function postDebugIngest(sessionId: string, payload: DebugIngestFields): void {
  const body = JSON.stringify({
    sessionId,
    runId: payload.runId ?? "pre-fix",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    timestamp: Date.now(),
  });
  const headers = {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": sessionId,
  };

  if (isDebugIngestEnabled()) {
    postFireAndForget(sinkPathForSession(sessionId), headers, body);
    return;
  }

  const productionUrl = resolveProductionTelemetryUrl();
  if (productionUrl) {
    postFireAndForget(productionUrl, headers, body);
  }
}
