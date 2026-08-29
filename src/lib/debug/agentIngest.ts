/** Dev-only debug telemetry — never call production endpoints from shipped bundles. */
export function agentDebugIngest(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  fetch("http://127.0.0.1:7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, timestamp: Date.now() }),
  }).catch(() => {});
}
