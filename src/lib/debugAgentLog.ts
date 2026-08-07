/**
 * Lightweight dev-only diagnostic logger.
 * No-op in production builds; used for tracing agent/debug flows.
 */
export type AgentLogPayload = {
  hypothesisId?: string;
  location?: string;
  message?: string;
  data?: unknown;
};

export function agentLog(entry: string | AgentLogPayload, ...args: unknown[]): void {
  if (import.meta.env.PROD) return;
  if (typeof entry === "string") {
    // eslint-disable-next-line no-console
    console.debug(`[agent] ${entry}`, ...args);
    return;
  }
  // eslint-disable-next-line no-console
  console.debug(
    `[agent${entry.hypothesisId ? `:${entry.hypothesisId}` : ""}] ${entry.location ?? ""} ${entry.message ?? ""}`.trim(),
    entry.data ?? "",
    ...args,
  );
}

export default agentLog;
