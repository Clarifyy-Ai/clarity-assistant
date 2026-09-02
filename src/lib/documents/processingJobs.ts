import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import {
  isKnownDocumentErrorCode,
  userFacingDocumentFailureMessage,
} from "@/lib/documents/documentFailure";

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

export function userFacingJobError(job: Pick<DocumentJob, "error_code" | "error_message"> | null | undefined): string {
  const code = String(job?.error_code ?? "");
  if (code === "INSUFFICIENT_CREDITS") {
    return "Not enough credits to process this document.";
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
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const run = (async () => {
    const started = Date.now();
    let last: DocumentJob | null = null;
    while (Date.now() - started < timeoutMs) {
      last = await getDocumentProcessingJob(jobId);
      if (!last || !isInFlightJobStatus(last.status)) return last;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    if (last && isInFlightJobStatus(last.status)) {
      return {
        ...last,
        error_code: "PARSER_TIMEOUT",
        error_message: userFacingDocumentFailureMessage("PARSER_TIMEOUT"),
        retryable: true,
      };
    }
    return last;
  })().finally(() => {
    if (activeDocumentPolls.get(jobId) === run) activeDocumentPolls.delete(jobId);
  });
  activeDocumentPolls.set(jobId, run);
  return run;
}
