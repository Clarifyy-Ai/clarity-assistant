/**
 * Structured operational logging — never logs secrets or raw payloads.
 */

export type OpsResult = "ok" | "error" | "denied" | "retryable";

export interface OpsLogFields {
  request_id?: string;
  correlation_id?: string;
  user_id?: string;
  function_name: string;
  operation: string;
  plan_id?: string;
  provider?: string;
  provider_event_id?: string;
  session_id?: string;
  latency_ms?: number;
  result: OpsResult;
  error_class?: string;
  retryable?: boolean;
  meta?: Record<string, string | number | boolean | null>;
}

const REDACT_KEYS =
  /secret|token|password|authorization|api[_-]?key|webhook|byok|transcript|document|prompt|utterance|resume|session_text/i;

export function opsLog(fields: OpsLogFields): void {
  const safeMeta: Record<string, unknown> = {};
  if (fields.meta) {
    for (const [k, v] of Object.entries(fields.meta)) {
      if (REDACT_KEYS.test(k)) continue;
      safeMeta[k] = v;
    }
  }

  const line = {
    ts: new Date().toISOString(),
    level: fields.result === "error" ? "error" : "info",
    ...fields,
    meta: Object.keys(safeMeta).length ? safeMeta : undefined,
  };

  // Structured single-line JSON for log drains
  console.log(JSON.stringify(line));
}
