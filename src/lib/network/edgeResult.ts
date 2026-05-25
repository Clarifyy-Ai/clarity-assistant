/**
 * Normalizes Supabase edge function JSON envelopes for client-side use.
 * fetchEdgeJson already unwraps `data`; raw fetchEdge responses need this helper.
 */
export function unwrapEdgePayload<T = Record<string, unknown>>(
  json: unknown
): T {
  if (!json || typeof json !== "object") return {} as T;
  const o = json as Record<string, unknown>;
  if (o.success === true && o.data && typeof o.data === "object") {
    return o.data as T;
  }
  return o as T;
}

/** prep-tool and similar tools return `{ result: string }` inside the envelope. */
export function unwrapPrepToolResult(json: unknown): string {
  const inner = unwrapEdgePayload<{ result?: string; hints?: string; hint?: string }>(json);
  return (
    inner.result ??
    inner.hints ??
    inner.hint ??
    (typeof json === "object" && json && "result" in (json as object)
      ? String((json as { result?: string }).result)
      : "")
  );
}
