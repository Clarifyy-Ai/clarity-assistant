/** Session 4a9592 debug ingest — Government Exam generation/credit/polling. */
export function debugLog4a9592(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  const body = JSON.stringify({
    sessionId: "4a9592",
    runId: payload.runId ?? "pre-fix",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    timestamp: Date.now(),
  });
  const headers = {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": "4a9592",
  };
  fetch("http://127.0.0.1:7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2", {
    method: "POST",
    headers,
    body,
  }).catch(() => {});
  fetch("/__agent_debug_4a9592", {
    method: "POST",
    headers,
    body,
  }).catch(() => {});
}
