/**
 * Persist hybrid operation provenance to public.backend_operation_log.
 *
 * Table columns (created by migration — insert assumes):
 *   id, operation_id, user_id, operation_type, source, provider,
 *   model_version, python_service_version, fallback_reason,
 *   execution_ms, status, correlation_id, created_at
 *
 * Fail soft: never throw — logging must not break the product path.
 */

import { getAdminClient } from "./utils.ts";
import type { OperationSource } from "./hybridResponse.ts";

export type OperationLogStatus = "success" | "failure" | "partial";

export type RecordOperationSourceInput = {
  operationId: string;
  userId?: string | null;
  operationType: string;
  source: OperationSource | string;
  provider?: string | null;
  modelVersion?: string | null;
  pythonServiceVersion?: string | null;
  fallbackReason?: string | null;
  executionMs?: number | null;
  status: OperationLogStatus | string;
  correlationId: string;
};

/**
 * Best-effort insert into backend_operation_log.
 * Swallows all errors after console.error.
 */
export async function recordOperationSource(
  input: RecordOperationSourceInput,
): Promise<void> {
  try {
    const admin = getAdminClient();
    const row = {
      operation_id: input.operationId,
      user_id: input.userId ?? null,
      operation_type: input.operationType,
      source: input.source,
      provider: input.provider ?? null,
      model_version: input.modelVersion ?? null,
      python_service_version: input.pythonServiceVersion ?? null,
      fallback_reason: input.fallbackReason ?? null,
      execution_ms:
        typeof input.executionMs === "number" && Number.isFinite(input.executionMs)
          ? Math.max(0, Math.floor(input.executionMs))
          : null,
      status: input.status,
      correlation_id: input.correlationId,
      created_at: new Date().toISOString(),
    };

    const { error } = await admin.from("backend_operation_log").insert(row);
    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          fn: "operationSource.recordOperationSource",
          message: error.message,
          correlation_id: input.correlationId,
          operation_id: input.operationId,
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "operationSource.recordOperationSource",
        message: err instanceof Error ? err.message : String(err),
        correlation_id: input.correlationId,
        operation_id: input.operationId,
      }),
    );
  }
}
