/** Session 161d95 debug ingest. Dev-only — never call localhost from production builds. */
export function debugLog161d95(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  if (!import.meta.env.DEV) return;
  const body = JSON.stringify({
    sessionId: "161d95",
    runId: payload.runId ?? "pre-fix",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    timestamp: Date.now(),
  });
  const headers = {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": "161d95",
  };
  fetch("http://127.0.0.1:7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2", {
    method: "POST",
    headers,
    body,
  }).catch(() => {});
  fetch("/__agent_debug_161d95", {
    method: "POST",
    headers,
    body,
  }).catch(() => {});
}
