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
  return parsePrepToolResponse(json).result;
}

export type PrepToolResponse = {
  result: string;
  source?: string;
  alternatives?: unknown;
  cached?: boolean;
};

/**
 * Normalize prep-tool / hybrid payloads after fetchEdgeJson.
 * Handles flat `{ result }`, `{ data: { result } }`, and hybrid envelopes.
 */
export function parsePrepToolResponse(raw: unknown): PrepToolResponse {
  if (typeof raw === "string") {
    return { result: raw.trim() };
  }
  if (!raw || typeof raw !== "object") {
    return { result: "" };
  }

  const obj = raw as Record<string, unknown>;
  const nested =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : null;
  const deepNested =
    nested?.data && typeof nested.data === "object"
      ? (nested.data as Record<string, unknown>)
      : null;

  const result = String(
    obj.result ??
      nested?.result ??
      deepNested?.result ??
      obj.hints ??
      nested?.hints ??
      obj.hint ??
      nested?.hint ??
      "",
  ).trim();

  const source =
    typeof obj.source === "string"
      ? obj.source
      : typeof nested?.source === "string"
        ? nested.source
        : typeof deepNested?.source === "string"
          ? deepNested.source
          : undefined;

  return {
    result,
    source,
    alternatives: obj.alternatives ?? nested?.alternatives ?? deepNested?.alternatives,
    cached: obj.cached === true || nested?.cached === true || deepNested?.cached === true,
  };
}
