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

function buildIngestBody(sessionId: string, payload: DebugIngestFields): string {
  return JSON.stringify({
    sessionId,
    runId: payload.runId ?? "pre-fix",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    timestamp: Date.now(),
  });
}

const INGEST_HEADERS = {
  "Content-Type": "application/json",
} as const;

/**
 * Dev-only debug telemetry via same-origin Vite middleware (CSP-safe).
 * The same-origin sink path lives only inside `import.meta.env.DEV` so production
 * bundles cannot contain localhost ingest URLs or agent debug sink strings.
 * Production posts only if VITE_DEBUG_INGEST_URL is https and not loopback.
 */
export function postDebugIngest(sessionId: string, payload: DebugIngestFields): void {
  const headers = {
    ...INGEST_HEADERS,
    "X-Debug-Session-Id": sessionId,
  };
  const body = buildIngestBody(sessionId, payload);

  // Vite DCE: this entire block (including the sink path literal) is dropped in prod.
  if (import.meta.env.DEV) {
    postFireAndForget(`/__agent_debug_${sessionId}`, headers, body);
    return;
  }

  const productionUrl = resolveProductionTelemetryUrl();
  if (productionUrl) {
    postFireAndForget(productionUrl, headers, body);
  }
}
