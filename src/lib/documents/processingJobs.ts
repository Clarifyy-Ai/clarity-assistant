import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import {
  DOCUMENT_ERROR_CODES,
  isKnownDocumentErrorCode,
  userFacingDocumentFailureMessage,
} from "@/lib/documents/documentFailure";

/** Soft client wait covers one worker lease (~180s) plus buffer. */
export const DOCUMENT_JOB_SOFT_WAIT_MS = 240_000;

/** When a job stays queued this long, assume the Python worker is unavailable. */
export const DOCUMENT_QUEUE_STUCK_MS = 45_000;

export type DocumentJobState =
  | "queued"
  | "leased"
  | "downloading"
  | "extracting"
  | "OCR"
  | "segmenting"
  | "validating"
  | "awaiting_review"
  | "completed"
  | "failed_retryable"
  | "failed_permanent"
  | "cancelled"
  | string;

export type DocumentJob = {
  id: string;
  document_id?: string;
  status: DocumentJobState;
  error_code?: string | null;
  error_message?: string | null;
  error_stage?: string | null;
  retryable?: boolean;
  attempt_count?: number;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

/** Job-table + library-projection statuses that mean work is still running. */
export const IN_FLIGHT_JOB_STATUSES = [
  "queued",
  "leased",
  "downloading",
  "extracting",
  "OCR",
  "ocr_required",
  "ocr_processing",
  "segmenting",
  "structuring",
  "processing",
  "validating",
  "awaiting_review",
] as const;

const IN_FLIGHT = new Set<string>(IN_FLIGHT_JOB_STATUSES);

export function isInFlightJobStatus(status: string | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "processing" || normalized === "validating") return true;
  return IN_FLIGHT.has(normalized === "ocr" ? "OCR" : normalized);
}

export function isTerminalLibraryStatus(status: string | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized === "completed" ||
    normalized === "ready" ||
    normalized === "cancelled" ||
    normalized === "rejected" ||
    isFailedJobStatus(status)
  );
}

export function libraryStatusFromJob(status: string | undefined): string {
  const normalized = String(status ?? "").trim();
  if (normalized === "completed" || normalized === "ready") return "completed";
  if (!normalized) return "uploaded";
  return normalized;
}

export function isFailedJobStatus(status: string | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "failed_retryable" || normalized === "failed_permanent" ||
    normalized === "error" || normalized === "failed";
}

/**
 * True when the client soft-wait ended while the durable job is still running.
 * This is informational — never treat as a terminal parse failure or trigger retry/recharge.
 */
export function isClientWaitElapsed(
  job: Pick<DocumentJob, "status" | "error_code"> | null | undefined,
): boolean {
  if (!job) return false;
  const code = String(job.error_code ?? "").trim().toUpperCase();
  if (code === DOCUMENT_ERROR_CODES.CLIENT_WAIT_ELAPSED) return true;
  // Legacy soft-poll synthesized PARSER_TIMEOUT while still in-flight.
  if (code === DOCUMENT_ERROR_CODES.PARSER_TIMEOUT && isInFlightJobStatus(job.status)) {
    return true;
  }
  return false;
}

export function isStuckQueuedJob(
  job: Pick<DocumentJob, "status" | "created_at"> | null | undefined,
): boolean {
  if (!job || String(job.status ?? "").trim().toLowerCase() !== "queued") return false;
  const created = Date.parse(String(job.created_at ?? ""));
  if (!Number.isFinite(created)) return false;
  return Date.now() - created >= DOCUMENT_QUEUE_STUCK_MS;
}

export function isQueueWorkerUnavailable(
  job: Pick<DocumentJob, "status" | "error_code"> | null | undefined,
): boolean {
  if (!job) return false;
  const code = String(job.error_code ?? "").trim().toUpperCase();
  return code === DOCUMENT_ERROR_CODES.QUEUE_WORKER_UNAVAILABLE || isStuckQueuedJob(job);
}

/**
 * Cancel a stuck durable job (refunds reserved credits) and run sync Edge parse.
 * Safe to call once per stuck job — parse-document library path does not re-charge.
 */
export async function recoverStuckQueuedDocumentJob(opts: {
  jobId: string;
  documentId: string;
  mimeType: string;
  contentHash: string;
  ownerId: string;
}): Promise<void> {
  await cancelDocumentProcessingJob(opts.jobId);
  const idempotencyKey = `library-parse:${opts.ownerId}:${opts.contentHash}:sync-recovery`.slice(0, 150);
  await parseDocumentFallback({
    libraryDocumentId: opts.documentId,
    mimeType: opts.mimeType,
    idempotencyKey,
  });
}

export function userFacingJobError(job: Pick<DocumentJob, "error_code" | "error_message"> | null | undefined): string {
  const code = String(job?.error_code ?? "");
  if (code === "INSUFFICIENT_CREDITS") {
    return "Not enough credits to process this document.";
  }
  if (isClientWaitElapsed(job as Parameters<typeof isClientWaitElapsed>[0])) {
    return userFacingDocumentFailureMessage(DOCUMENT_ERROR_CODES.CLIENT_WAIT_ELAPSED);
  }
  if (isQueueWorkerUnavailable(job as Parameters<typeof isQueueWorkerUnavailable>[0])) {
    return userFacingDocumentFailureMessage(DOCUMENT_ERROR_CODES.QUEUE_WORKER_UNAVAILABLE);
  }
  if (isKnownDocumentErrorCode(code)) {
    return userFacingDocumentFailureMessage(code, job?.error_message);
  }
  return job?.error_message || "Document processing failed. You can retry.";
}

export function userFacingDocumentError(err: unknown): string {
  const code = err instanceof ApiClientError ? String(err.code ?? "") : "";
  const status = err instanceof ApiClientError ? err.status : 0;
  const fallback = err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : null;
  if (code === "INSUFFICIENT_CREDITS" || status === 402) {
    return "Not enough credits to process this document.";
  }
  if (code === "STORAGE_FAILED") {
    return "The document could not be read from private storage.";
  }
  if (code === "OCR_UNAVAILABLE") {
    return "OCR is temporarily unavailable. You can retry.";
  }
  if (code === "OCR_FAILED") {
    return "OCR could not read this scanned document. You can retry.";
  }
  if (isKnownDocumentErrorCode(code)) {
    return userFacingDocumentFailureMessage(code, fallback);
  }
  if (status === 503 || status === 502) {
    return userFacingDocumentFailureMessage("PARSER_UNAVAILABLE");
  }
  return userFacingDocumentFailureMessage("PARSER_FAILED", fallback);
}

type CreateJobResult = {
  jobId?: string;
  state?: string;
  pythonConfigured?: boolean;
  success?: boolean;
};

export async function createDocumentProcessingJob(opts: {
  documentId: string;
  idempotencyKey: string;
}): Promise<CreateJobResult> {
  return fetchEdgeJson<CreateJobResult>("create-document-processing-job", {
    documentId: opts.documentId,
    idempotencyKey: opts.idempotencyKey,
  });
}

export async function getDocumentProcessingJob(jobId: string): Promise<DocumentJob | null> {
  const data = await fetchEdgeJson<{ success?: boolean; job?: DocumentJob }>(
    "get-document-processing-job",
    { jobId },
  );
  return data.job ?? null;
}

export async function cancelDocumentProcessingJob(jobId: string): Promise<void> {
  await fetchEdgeJson("cancel-document-processing-job", { jobId });
}

export async function retryDocumentProcessingJob(jobId: string): Promise<void> {
  await fetchEdgeJson("retry-document-processing-job", { jobId });
}

export async function parseDocumentFallback(opts: {
  libraryDocumentId: string;
  mimeType: string;
  idempotencyKey: string;
}): Promise<void> {
  await fetchEdgeJson(
    "parse-document",
    {
      library_document_id: opts.libraryDocumentId,
      mime_type: opts.mimeType,
    },
    {
      timeoutMs: 90_000,
      headers: { "x-idempotency-key": opts.idempotencyKey },
    },
  );
}

export function shouldFallbackToSyncParse(err: unknown, created?: CreateJobResult | null): boolean {
  if (created && created.pythonConfigured === false) return true;
  if (!err) return false;
  // Soft client wait is never a reason to sync-parse (would double-charge).
  if (err instanceof Error && /still processing|CLIENT_WAIT_ELAPSED/i.test(err.message)) {
    return false;
  }
  if (err instanceof ApiClientError) {
    const code = String(err.code ?? "");
    return (
      err.status === 501 ||
      err.status === 503 ||
      // Empty/legacy MIME on the row used to 422 job create — sync parse can still succeed
      // when the client supplies a resolved mime_type.
      (err.status === 422 && code === "UNSUPPORTED_DOCUMENT_TYPE") ||
      code === "JOB_CREATE_FAILED" ||
      code === "PYTHON_UNAVAILABLE" ||
      code === "NOT_CONFIGURED"
    );
  }
  return false;
}

const activeDocumentPolls = new Map<string, Promise<DocumentJob | null>>();

export async function pollDocumentJobUntilDone(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<DocumentJob | null> {
  const existing = activeDocumentPolls.get(jobId);
  if (existing) return existing;

  const intervalMs = opts?.intervalMs ?? 2500;
  const timeoutMs = opts?.timeoutMs ?? DOCUMENT_JOB_SOFT_WAIT_MS;
  const run = (async () => {
    const started = Date.now();
    let last: DocumentJob | null = null;
    while (Date.now() - started < timeoutMs) {
      last = await getDocumentProcessingJob(jobId);
      if (!last || !isInFlightJobStatus(last.status)) return last;
      if (isStuckQueuedJob(last)) {
        return {
          ...last,
          error_code: DOCUMENT_ERROR_CODES.QUEUE_WORKER_UNAVAILABLE,
          error_message: userFacingDocumentFailureMessage(DOCUMENT_ERROR_CODES.QUEUE_WORKER_UNAVAILABLE),
          retryable: true,
        };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    if (last && isInFlightJobStatus(last.status)) {
      return {
        ...last,
        error_code: DOCUMENT_ERROR_CODES.CLIENT_WAIT_ELAPSED,
        error_message: userFacingDocumentFailureMessage(DOCUMENT_ERROR_CODES.CLIENT_WAIT_ELAPSED),
        // Soft wait is not a failure — job remains in flight; do not nudge Retry.
        retryable: false,
      };
    }
    return last;
  })().finally(() => {
    if (activeDocumentPolls.get(jobId) === run) activeDocumentPolls.delete(jobId);
  });
  activeDocumentPolls.set(jobId, run);
  return run;
}
