/**
 * Lightweight dev-only diagnostic logger.
 * No-op in production builds; used for tracing agent/debug flows.
 */
export function agentLog(scope: string, ...args: unknown[]): void {
  if (import.meta.env.PROD) return;
  // eslint-disable-next-line no-console
  console.debug(`[agent:${scope}]`, ...args);
}

export default agentLog;
