/**
 * Unified hybrid backend response contract for Edge Functions.
 *
 * Success: { success: true, source, operation_id, data, correlation_id, meta? }
 * Failure: { success: false, code, message, retryable, correlation_id }
 *
 * Never expose provider secrets, internal service URLs, or stack traces.
 */

import { applyCors, getCorsHeaders, resolveCorrelationId } from "./cors.ts";
import {
  defaultMessage,
  httpStatusForDomainCode,
  isRetryable,
  type DomainErrorCode,
} from "./domainErrors.ts";

export type OperationSource =
  | "database"
  | "python"
  | "ai"
  | "fallback"
  | "deterministic";

export type HybridSuccessBody<T = unknown> = {
  success: true;
  source: OperationSource;
  operation_id: string;
  data: T;
  correlation_id: string;
  meta?: HybridMeta;
};

export type HybridFailureBody = {
  success: false;
  code: DomainErrorCode | string;
  message: string;
  retryable: boolean;
  correlation_id: string;
};

export type HybridMeta = {
  execution_ms?: number;
  fallback_reason?: string;
  /** High-level provider family only — never keys or hostnames. */
  provider?: string;
  model_version?: string;
  python_service_version?: string;
  [key: string]: string | number | boolean | null | undefined;
};

export type HybridSuccessArgs<T = unknown> = {
  req: Request;
  data: T;
  source: OperationSource;
  operationId: string;
  correlationId?: string;
  meta?: HybridMeta;
  status?: number;
};

export type HybridFailureArgs = {
  req: Request;
  code: DomainErrorCode | string;
  message?: string;
  correlationId?: string;
  retryable?: boolean;
  status?: number;
};

function baseHeaders(req: Request): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...getCorsHeaders(req),
  };
}

/** Strip keys that could leak secrets or internal infra. */
export function sanitizeMeta(meta?: HybridMeta): HybridMeta | undefined {
  if (!meta) return undefined;
  const blocked =
    /secret|token|password|authorization|api[_-]?key|webhook|url|host|endpoint|dsn|service_role/i;
  const out: HybridMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (blocked.test(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function hybridSuccess<T>(args: HybridSuccessArgs<T>): Response {
  const correlationId = args.correlationId ?? resolveCorrelationId(args.req);
  const body: HybridSuccessBody<T> = {
    success: true,
    source: args.source,
    operation_id: args.operationId,
    data: args.data,
    correlation_id: correlationId,
  };
  const meta = sanitizeMeta(args.meta);
  if (meta) body.meta = meta;

  const response = new Response(JSON.stringify(body), {
    status: args.status ?? 200,
    headers: baseHeaders(args.req),
  });
  return applyCors(args.req, response, correlationId);
}

export function hybridFailure(args: HybridFailureArgs): Response {
  const correlationId = args.correlationId ?? resolveCorrelationId(args.req);
  const code = args.code;
  const retryable = args.retryable ?? isRetryable(code);
  const body: HybridFailureBody = {
    success: false,
    code,
    message: args.message ?? defaultMessage(code as DomainErrorCode),
    retryable,
    correlation_id: correlationId,
  };

  const response = new Response(JSON.stringify(body), {
    status: args.status ?? httpStatusForDomainCode(code),
    headers: baseHeaders(args.req),
  });
  return applyCors(args.req, response, correlationId);
}
