/**
 * Dev-only diagnostic logger for remediation session 70dd4b.
 * Posts NDJSON to the Vite middleware at /__agent_debug_70dd4b (no-op in production).
 */
export type AgentLog70dd4bPayload = {
  hypothesisId?: string;
  location?: string;
  message?: string;
  data?: unknown;
};

const SESSION_ID = "70dd4b";

export function agentLog70dd4b(payload: AgentLog70dd4bPayload): void {
  if (import.meta.env.PROD) return;

  const line = JSON.stringify({
    sessionId: SESSION_ID,
    runId: "browser",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data,
    timestamp: Date.now(),
  });

  // eslint-disable-next-line no-console
  console.debug(`[agent:${payload.hypothesisId ?? SESSION_ID}]`, payload.message ?? "", payload.data ?? "");

  void fetch("/__agent_debug_70dd4b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: line,
  }).catch(() => undefined);
}
