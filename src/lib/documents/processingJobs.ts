import { ApiClientError } from "@/lib/api/apiClient";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";

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
  const messages: Record<string, string> = {
    INSUFFICIENT_CREDITS: "Not enough credits to process this document.",
    FILE_TOO_LARGE: "This file is too large to process.",
    UNSUPPORTED_FILE_TYPE: "This file type is not supported.",
    PARSER_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
    PARSER_FAILED: "The document could not be parsed. Try another file or retry.",
  };
  if (messages[code]) {
    return messages[code];
  }
  return job?.error_message || "Document processing failed. You can retry.";
}

export function userFacingDocumentError(err: unknown): string {
  const code = err instanceof ApiClientError ? String(err.code ?? "") : "";
  const status = err instanceof ApiClientError ? err.status : 0;
  const messages: Record<string, string> = {
    UNSUPPORTED_FILE_TYPE: "This file type is not supported.",
    UNSUPPORTED_DOCUMENT_TYPE: "This file type is not supported.",
    FILE_TOO_LARGE: "This file is too large to process.",
    EMPTY_FILE: "This file is empty.",
    CORRUPT_FILE: "The file is corrupt or unreadable.",
    ENCRYPTED_FILE: "This document is encrypted and cannot be read.",
    PARSER_FAILED: "The document could not be parsed. Try another file or retry.",
    PARSER_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
    OCR_UNAVAILABLE: "OCR is temporarily unavailable. You can retry.",
    OCR_FAILED: "OCR could not read this scanned document. You can retry.",
    INSUFFICIENT_CREDITS: "Not enough credits to process this document.",
    STORAGE_FAILED: "The document could not be read from private storage.",
  };
  if (messages[code]) return messages[code];
  if (status === 402) return messages.INSUFFICIENT_CREDITS;
  if (status === 503 || status === 502) return messages.PARSER_UNAVAILABLE;
  return "Document processing failed. You can retry.";
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

export async function pollDocumentJobUntilDone(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<DocumentJob | null> {
  const intervalMs = opts?.intervalMs ?? 2500;
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const started = Date.now();
  let last: DocumentJob | null = null;
  while (Date.now() - started < timeoutMs) {
    last = await getDocumentProcessingJob(jobId);
    if (!last || !isInFlightJobStatus(last.status)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}
