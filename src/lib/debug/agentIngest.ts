import { postDebugIngest } from "@/lib/debug/debugIngest";

/** Dev-only agent debug telemetry — production no-op unless a secure ingest URL is configured. */
export function agentDebugIngest(payload: Record<string, unknown>): void {
  const sessionId = typeof payload.sessionId === "string" && payload.sessionId.trim()
    ? payload.sessionId.trim()
    : "agent";
  postDebugIngest(sessionId, {
    hypothesisId: String(payload.hypothesisId ?? ""),
    location: String(payload.location ?? ""),
    message: String(payload.message ?? ""),
    data:
      payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : undefined,
    runId: typeof payload.runId === "string" ? payload.runId : undefined,
  });
}
